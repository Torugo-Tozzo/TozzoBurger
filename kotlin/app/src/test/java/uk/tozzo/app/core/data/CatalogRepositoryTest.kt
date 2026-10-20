package uk.tozzo.app.core.data

import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import uk.tozzo.app.domain.Product
import uk.tozzo.app.testing.RobolectricSql

@RunWith(RobolectricTestRunner::class)
class CatalogRepositoryTest {
    private lateinit var sql: RobolectricSql
    private lateinit var repo: CatalogRepository

    @Before
    fun setUp() {
        sql = RobolectricSql()
        repo = CatalogRepository(sql)
    }

    @After
    fun tearDown() = sql.close()

    private suspend fun type(
        id: String,
        description: String,
        active: Int = 1,
        deletedAt: String? = null,
    ) = sql.execute(
        "INSERT INTO product_types (id, description, color, is_active, deleted_at) VALUES (?, ?, '#fff', ?, ?)",
        listOf(id, description, active, deletedAt),
    )

    private suspend fun product(
        id: String,
        name: String,
        price: String? = "10.00",
        typeId: String? = null,
        deletedAt: String? = null,
    ) = sql.execute(
        "INSERT INTO products (id, name, price, ingredients, product_type_id, image_key, deleted_at) " +
            "VALUES (?, ?, ?, 'cheese', ?, 'k', ?)",
        listOf(id, name, price, typeId, deletedAt),
    )

    @Test
    fun productOfAnInactiveTypeIsHiddenButOneWithoutTypeShows() =
        runTest {
            type("t1", "Burgers")
            type("t2", "Old", active = 0)
            product("p1", "X-Burger", typeId = "t1")
            product("p2", "Old thing", typeId = "t2")
            product("p3", "Loose", typeId = null)

            assertEquals(listOf("Loose", "X-Burger"), repo.products("", null, 50).first().map { it.name })
        }

    @Test
    fun productOfADeletedTypeIsHiddenToo() =
        runTest {
            type("t1", "Gone", deletedAt = "2026-10-20 10:00:00.000")
            product("p1", "Orphan", typeId = "t1")

            assertEquals(emptyList<String>(), repo.products("", null, 50).first().map { it.name })
        }

    @Test
    fun deletedRowsNeverShow() =
        runTest {
            product("p1", "Alive")
            product("p2", "Dead", deletedAt = "2026-10-20 10:00:00.000")

            assertEquals(listOf("Alive"), repo.products("", null, 50).first().map { it.name })
            assertNull(repo.product("p2").first())
        }

    @Test
    fun searchIgnoresCase() =
        runTest {
            product("p1", "X-Burger")
            product("p2", "Coke")

            assertEquals(listOf("X-Burger"), repo.products("burGER", null, 50).first().map { it.name })
        }

    @Test
    fun searchIgnoresCaseOfAccentedLetters() =
        runTest {
            product("p1", "ÁGUA")
            product("p2", "PÃO DE QUEIJO")
            product("p3", "Coke")

            assertEquals(listOf("ÁGUA"), repo.products("água", null, 50).first().map { it.name })
            assertEquals(listOf("PÃO DE QUEIJO"), repo.products("pao", null, 50).first().map { it.name })
            assertEquals(listOf("PÃO DE QUEIJO"), repo.products("Pão de", null, 50).first().map { it.name })
        }

    @Test
    fun limitCountsOnlyProductsWithAValidPrice() =
        runTest {
            product("p1", "A bad", price = "abc")
            product("p2", "B ok")
            product("p3", "C ok")

            assertEquals(listOf("B ok", "C ok"), repo.products("", null, 2).first().map { it.name })
        }

    @Test
    fun searchTreatsPercentAndUnderscoreAsPlainText() =
        runTest {
            product("p1", "100% beef")
            product("p2", "Coke")

            assertEquals(listOf("100% beef"), repo.products("%", null, 50).first().map { it.name })
            assertEquals(emptyList<String>(), repo.products("_", null, 50).first().map { it.name })
        }

    @Test
    fun typeFilterNarrowsTheList() =
        runTest {
            type("t1", "Burgers")
            type("t2", "Drinks")
            product("p1", "X-Burger", typeId = "t1")
            product("p2", "Coke", typeId = "t2")

            assertEquals(listOf("Coke"), repo.products("", "t2", 50).first().map { it.name })
        }

    @Test
    fun limitApplies() =
        runTest {
            (1..5).forEach { product("p$it", "Item $it") }

            assertEquals(listOf("Item 1", "Item 2"), repo.products("", null, 2).first().map { it.name })
        }

    @Test
    fun invalidPriceIsDroppedAndPricesAreExactCents() =
        runTest {
            product("p1", "Good", price = "12.5")
            product("p2", "Bad", price = "abc")
            product("p3", "Missing", price = null)

            val products = repo.products("", null, 50).first()

            assertEquals(listOf("Good"), products.map { it.name })
            assertEquals(1250L, products.single().priceCents)
        }

    @Test
    fun productMapsEveryField() =
        runTest {
            type("t1", "Burgers")
            product("p1", "X-Burger", price = "20.00", typeId = "t1")

            assertEquals(Product("p1", "X-Burger", 2000L, "cheese", "t1", "k"), repo.product("p1").first())
        }

    @Test
    fun typesOmitInactiveUnlessAskedAndSortByDescription() =
        runTest {
            type("t1", "Drinks")
            type("t2", "Burgers")
            type("t3", "Old", active = 0)
            type("t4", "Gone", deletedAt = "2026-10-20 10:00:00.000")

            assertEquals(
                listOf("Burgers", "Drinks"),
                repo.types(includeInactive = false).first().map { it.description },
            )
            val all = repo.types(includeInactive = true).first()
            assertEquals(listOf("Burgers", "Drinks", "Old"), all.map { it.description })
            assertEquals(false, all.last().isActive)
            assertEquals("#fff", all.first().color)
        }

    @Test
    fun manageProductsFollowsTheWebRuleAndKeepsAnInvalidPriceToFix() =
        runTest {
            type("t1", "Burgers")
            type("t2", "Old", active = 0)
            product("p1", "X-Burger", typeId = "t1")
            product("p2", "Old thing", typeId = "t2")
            product("p3", "No price", price = "abc")
            product("p4", "Gone", deletedAt = "2026-01-01")

            val rows = repo.manageProducts("", 50).first()

            // Like GET /v1/products: the products of an inactive type are left out.
            assertEquals(listOf("No price", "X-Burger"), rows.map { it.name })
            assertNull(rows.first { it.name == "No price" }.priceCents)
            assertEquals(1000L, rows.first { it.name == "X-Burger" }.priceCents)
        }

    @Test
    fun manageProductsSearchesIgnoringAccentsAndLimits() =
        runTest {
            product("p1", "PÃO de queijo")
            product("p2", "Pastel")
            product("p3", "Pizza")

            assertEquals(listOf("PÃO de queijo"), repo.manageProducts("pao", 50).first().map { it.name })
            assertEquals(2, repo.manageProducts("", 2).first().size)
        }

    @Test
    fun productForEditOpensAnyTypeAndAnyPrice() =
        runTest {
            type("t2", "Old", active = 0)
            product("p1", "Old thing", price = null, typeId = "t2")

            val found = repo.productForEdit("p1")!!

            assertEquals("Old thing", found.name)
            assertNull(found.priceCents)
            assertEquals("t2", found.typeId)
            assertNull(repo.productForEdit("missing"))
        }
}
