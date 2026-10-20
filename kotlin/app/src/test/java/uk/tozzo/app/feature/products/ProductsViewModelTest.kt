package uk.tozzo.app.feature.products

import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import okhttp3.OkHttpClient
import okhttp3.RequestBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import uk.tozzo.app.R
import uk.tozzo.app.core.data.CatalogRepository
import uk.tozzo.app.core.data.CatalogWriter
import uk.tozzo.app.core.data.ImageInfo
import uk.tozzo.app.core.data.ImageSource
import uk.tozzo.app.core.data.ProductImageUploader
import uk.tozzo.app.core.network.CreateUploadRequest
import uk.tozzo.app.core.network.SetProductImageRequest
import uk.tozzo.app.core.network.UploadTicket
import uk.tozzo.app.core.network.UploadsApi
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.domain.Role
import uk.tozzo.app.testing.FakeConnectivity
import uk.tozzo.app.testing.MemoryStore
import uk.tozzo.app.testing.RobolectricSql
import uk.tozzo.app.testing.foodOwnerBinding

private class NeverCalledApi : UploadsApi {
    var calls = 0

    override suspend fun create(body: CreateUploadRequest): UploadTicket {
        calls++
        error("not used")
    }

    override suspend fun setProductImage(
        productId: String,
        body: SetProductImageRequest,
    ) {
        calls++
    }
}

private class NoSource : ImageSource {
    override fun info(uri: Uri): ImageInfo? = null

    override fun body(
        uri: Uri,
        contentType: String,
        sizeBytes: Long,
    ): RequestBody = error("not used")
}

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class ProductsViewModelTest {
    private lateinit var sql: RobolectricSql
    private val api = NeverCalledApi()
    private val connectivity = FakeConnectivity(initial = true)

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        sql = RobolectricSql()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        sql.close()
    }

    private suspend fun viewModel(role: Role = Role.OWNER): ProductsViewModel {
        val binding = DeviceBinding(MemoryStore())
        binding.save(foodOwnerBinding(role))
        return ProductsViewModel(
            CatalogRepository(sql),
            CatalogWriter(sql),
            ProductImageUploader(api, OkHttpClient(), NoSource()),
            connectivity,
            binding,
        )
    }

    private suspend fun productCount() = sql.getAll("SELECT id FROM products", emptyList()) { it.string("id") }.size

    @Test
    fun emptyNameBlocksTheSave() =
        runTest {
            val vm = viewModel()
            vm.openProductForm(null)
            vm.editProduct { it.copy(name = "   ", priceDigits = "1250") }

            vm.saveProduct()

            assertTrue(vm.productForm.value!!.nameError)
            assertFalse(vm.productForm.value!!.priceError)
            assertEquals(0, productCount())
        }

    @Test
    fun emptyPriceBlocksTheSave() =
        runTest {
            val vm = viewModel()
            vm.openProductForm(null)
            vm.editProduct { it.copy(name = "X-Burger", priceDigits = "") }

            vm.saveProduct()

            assertTrue(vm.productForm.value!!.priceError)
            assertFalse(vm.productForm.value!!.nameError)
            assertEquals(0, productCount())
        }

    @Test
    fun aPriceAboveTheApiLimitBlocksTheSave() =
        runTest {
            val vm = viewModel()
            vm.openProductForm(null)
            vm.editProduct { it.copy(name = "X", priceDigits = "10000000000") }

            vm.saveProduct()

            assertTrue(vm.productForm.value!!.priceError)
            assertEquals(0, productCount())
        }

    @Test
    fun aValidFormIsWrittenAndClosed() =
        runTest {
            val vm = viewModel()
            vm.openProductForm(null)
            vm.editProduct { it.copy(name = "X-Burger", priceDigits = "1250", ingredients = "cheese") }

            vm.saveProduct()

            assertNull(vm.productForm.value)
            val row =
                sql.getAll("SELECT name, price, ingredients FROM products", emptyList()) {
                    listOf(it.string("name"), it.string("price"), it.string("ingredients"))
                }
            assertEquals(listOf(listOf("X-Burger", "12.50", "cheese")), row)
        }

    @Test
    fun aProductWithAnInvalidPriceOpensWithAnEmptyPriceToFix() =
        runTest {
            sql.execute("INSERT INTO product_types (id, description, color, is_active) VALUES ('t1', 'Old', '#fff', 0)")
            sql.execute(
                "INSERT INTO products (id, name, price, product_type_id) VALUES ('p1', 'Old thing', 'abc', 't1')",
            )
            val vm = viewModel()

            vm.openProductForm("p1")

            val form = vm.productForm.value!!
            assertEquals("Old thing", form.name)
            assertEquals("", form.priceDigits)
            assertEquals("t1", form.typeId)
            vm.saveProduct()
            assertTrue(vm.productForm.value!!.priceError)

            vm.editProduct { it.copy(priceDigits = "990") }
            vm.saveProduct()

            assertNull(vm.productForm.value)
            assertEquals(
                "9.90",
                sql.getAll("SELECT price FROM products WHERE id = 'p1'") { it.string("price") }.single(),
            )
        }

    @Test
    fun emptyDescriptionBlocksTheTypeSave() =
        runTest {
            val vm = viewModel()
            vm.openTypeForm(null)
            vm.editType { it.copy(description = " ") }

            vm.saveType()

            assertTrue(vm.typeForm.value!!.descriptionError)
            assertEquals(0, sql.getAll("SELECT id FROM product_types") { it.string("id") }.size)

            vm.editType { it.copy(description = "Burgers", color = "#EF4444") }
            vm.saveType()

            assertNull(vm.typeForm.value)
            assertEquals("#EF4444", sql.getAll("SELECT color FROM product_types") { it.string("color") }.single())
        }

    @Test
    fun theListGrowsFiftyAtATimeAndSearchesAfterTheDebounce() =
        runTest {
            repeat(60) { i ->
                sql.execute(
                    "INSERT INTO products (id, name, price) VALUES (?, ?, '1.00')",
                    listOf("p$i", "Item %02d".format(i)),
                )
            }
            val vm = viewModel()
            assertEquals(50, vm.products.value!!.size)

            vm.loadMore()
            assertEquals(60, vm.products.value!!.size)

            vm.setSearch("item 07")
            // Until the pause the old query stays, back to the first page.
            advanceTimeBy(100)
            assertEquals(50, vm.products.value!!.size)
            advanceTimeBy(300)
            assertEquals(listOf("Item 07"), vm.products.value!!.map { it.name })
        }

    @Test
    fun typesListIncludesTheInactiveOnes() =
        runTest {
            sql.execute("INSERT INTO product_types (id, description, color, is_active) VALUES ('t1', 'Old', '#fff', 0)")
            val vm = viewModel()

            assertEquals(listOf(false), vm.types.value!!.map { it.isActive })
        }

    @Test
    fun offlineTheImageUploadIsRefusedWithoutTouchingTheFileOrTheApi() =
        runTest {
            connectivity.online.value = false
            val vm = viewModel()
            vm.openProductForm(null)
            vm.editProduct { it.copy(id = "p1") }

            vm.uploadImage(Uri.parse("content://media/1"))

            assertEquals(ImageUploadState.Failed(R.string.products_image_offline), vm.productForm.value!!.upload)
            assertEquals(0, api.calls)
            assertNotNull(vm.productForm.value)
        }

    @Test
    fun anEmployeeReadsButCannotOpenFormsDeleteOrUpload() =
        runTest {
            sql.execute("INSERT INTO products (id, name, price) VALUES ('p1', 'X', '1.00')")
            sql.execute("INSERT INTO product_types (id, description, color, is_active) VALUES ('t1', 'T', '#fff', 1)")
            val vm = viewModel(Role.EMPLOYEE)

            assertFalse(vm.canEdit.value)
            assertEquals(listOf("X"), vm.products.value!!.map { it.name })
            vm.openProductForm(null)
            vm.openProductForm("p1")
            vm.openTypeForm(null)
            vm.openTypeForm("t1")
            vm.deleteProduct("p1")
            vm.deleteType("t1")

            assertNull(vm.productForm.value)
            assertNull(vm.typeForm.value)
            assertEquals(1, productCount())
            assertEquals(1, sql.getAll("SELECT id FROM product_types") { it.string("id") }.size)
        }

    @Test
    fun ownersAndManagersCanEdit() =
        runTest {
            assertTrue(viewModel(Role.MANAGER).canEdit.value)
            assertTrue(viewModel(Role.OWNER).canEdit.value)
            val vm = viewModel(Role.MANAGER)
            vm.openProductForm(null)
            assertNotNull(vm.productForm.value)
        }
}
