package uk.tozzo.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uk.tozzo.app.R
import uk.tozzo.app.domain.Product
import uk.tozzo.app.domain.ProductType

/**
 * Search, type chips and the product list that Sell, Orders and Products share. It fills the height it
 * is given (the list scrolls). The search is not debounced here: the owner's view model does that.
 */
@Composable
fun ProductPicker(
    types: List<ProductType>,
    products: List<Product>,
    search: String,
    typeId: String?,
    onSearch: (String) -> Unit,
    onType: (String?) -> Unit,
    onAdd: (Product) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TozzoTextField(search, onSearch, stringResource(R.string.picker_search))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            item(key = "all") { TypeChip(stringResource(R.string.type_all), typeId == null, { onType(null) }) }
            items(types, key = { it.id }) { type ->
                TypeChip(typeLabel(type), typeId == type.id, { onType(type.id) })
            }
        }
        if (products.isEmpty()) {
            EmptyState(stringResource(R.string.picker_empty))
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(products, key = { it.id }) { product ->
                    TozzoCard(modifier = Modifier.fillMaxWidth(), onClick = { onAdd(product) }) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                product.name,
                                style = MaterialTheme.typography.titleMedium,
                                modifier = Modifier.weight(1f),
                            )
                            MoneyText(product.priceCents, style = MaterialTheme.typography.titleMedium)
                        }
                    }
                }
            }
        }
    }
}
