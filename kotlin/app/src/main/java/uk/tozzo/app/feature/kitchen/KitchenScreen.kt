@file:Suppress("MatchingDeclarationName")

package uk.tozzo.app.feature.kitchen

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLocale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import uk.tozzo.app.R
import uk.tozzo.app.core.data.KitchenCard
import uk.tozzo.app.domain.KitchenStage
import uk.tozzo.app.feature.orders.dateTimeText
import uk.tozzo.app.ui.components.ButtonVariant
import uk.tozzo.app.ui.components.LoadingState
import uk.tozzo.app.ui.components.TozzoButton
import uk.tozzo.app.ui.components.TozzoCard
import uk.tozzo.app.ui.icons.TozzoIcons

private const val ORDER_ID_PREFIX = 6

/** What the screen asks of the view model. */
data class KitchenActions(
    val onMove: (KitchenCard, KitchenStage) -> Unit,
    val onInfo: (KitchenCard) -> Unit,
    val onDismissInfo: () -> Unit,
    /** The refused move was shown; it is shown once. */
    val onErrorShown: () -> Unit = {},
)

@Composable
fun KitchenRoute(viewModel: KitchenViewModel = hiltViewModel()) {
    val board by viewModel.board.collectAsStateWithLifecycle()
    val failed by viewModel.moveFailed.collectAsStateWithLifecycle()
    val info by viewModel.info.collectAsStateWithLifecycle()
    KitchenScreen(
        board = board,
        moveFailed = failed,
        info = info,
        actions = KitchenActions(viewModel::move, viewModel::showInfo, viewModel::dismissInfo, viewModel::dismissError),
    )
}

/** Two tabs, "Em preparo (N)" and "Pronto (N)", each a list of cards that move to the other tab. */
@Composable
fun KitchenScreen(
    board: Map<KitchenStage, List<KitchenCard>>?,
    moveFailed: Boolean,
    info: KitchenCard?,
    actions: KitchenActions,
    modifier: Modifier = Modifier,
) {
    if (board == null) {
        Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { LoadingState() }
        return
    }
    val snackbar = remember { SnackbarHostState() }
    MoveFailedEffect(moveFailed, snackbar, actions.onErrorShown)
    var selected by rememberSaveable { mutableStateOf(0) }
    val stage = KitchenStage.entries[selected]
    val inPreparation = board[KitchenStage.IN_PREPARATION].orEmpty()
    val ready = board[KitchenStage.READY].orEmpty()
    Box(modifier.fillMaxSize()) {
        Board(stage, inPreparation, ready, actions, onSelect = { selected = it.ordinal })
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter))
    }
    if (info != null) InfoDialog(info, actions.onDismissInfo)
}

/**
 * A refused move ("A comanda mudou…", the web's text) shows once as a snackbar. It runs in its own scope:
 * clearing the error restarts the effect, which would cancel a showSnackbar launched from it.
 */
@Composable
private fun MoveFailedEffect(
    moveFailed: Boolean,
    snackbar: SnackbarHostState,
    onShown: () -> Unit,
) {
    val message = stringResource(R.string.kitchen_conflict)
    val scope = rememberCoroutineScope()
    LaunchedEffect(moveFailed) {
        if (!moveFailed) return@LaunchedEffect
        onShown()
        scope.launch { snackbar.showSnackbar(message) }
    }
}

@Composable
private fun Board(
    stage: KitchenStage,
    inPreparation: List<KitchenCard>,
    ready: List<KitchenCard>,
    actions: KitchenActions,
    onSelect: (KitchenStage) -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        PrimaryTabRow(selectedTabIndex = stage.ordinal, containerColor = MaterialTheme.colorScheme.background) {
            Tab(
                selected = stage == KitchenStage.IN_PREPARATION,
                onClick = { onSelect(KitchenStage.IN_PREPARATION) },
                text = { Text(stringResource(R.string.kitchen_tab_in_preparation, inPreparation.size)) },
            )
            Tab(
                selected = stage == KitchenStage.READY,
                onClick = { onSelect(KitchenStage.READY) },
                text = { Text(stringResource(R.string.kitchen_tab_ready, ready.size)) },
            )
        }
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(key = "top") { Box(Modifier.padding(top = 4.dp)) }
            items(if (stage == KitchenStage.READY) ready else inPreparation, key = { it.itemIds.first() }) {
                KitchenCardView(it, actions)
            }
            item(key = "end") { Box(Modifier.padding(bottom = 8.dp)) }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun KitchenCardView(
    card: KitchenCard,
    actions: KitchenActions,
) {
    val toReady = card.stage == KitchenStage.IN_PREPARATION
    TozzoCard(
        modifier =
            Modifier
                .fillMaxWidth()
                .combinedClickable(onClick = {}, onLongClick = { actions.onInfo(card) }),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(itemLabel(card), style = MaterialTheme.typography.titleMedium)
                Text(orderLabel(card), style = MaterialTheme.typography.bodyMedium)
            }
            IconButton(onClick = { actions.onInfo(card) }) {
                Icon(TozzoIcons.Info, contentDescription = stringResource(R.string.kitchen_view_info))
            }
        }
        TozzoButton(
            text =
                stringResource(
                    if (toReady) R.string.kitchen_mark_ready else R.string.kitchen_back_to_preparation,
                ),
            onClick = { actions.onMove(card, if (toReady) KitchenStage.READY else KitchenStage.IN_PREPARATION) },
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            variant = if (toReady) ButtonVariant.Primary else ButtonVariant.Outline,
        )
    }
}

@Composable
private fun itemLabel(card: KitchenCard): String =
    "${card.quantity}x ${card.productName ?: stringResource(R.string.kitchen_unavailable_product)}"

@Composable
private fun orderLabel(card: KitchenCard): String =
    card.customerName ?: stringResource(R.string.kitchen_order_fallback, card.orderId.take(ORDER_ID_PREFIX))

@Composable
private fun InfoDialog(
    card: KitchenCard,
    onDismiss: () -> Unit,
) {
    val locale = LocalLocale.current.platformLocale
    val notInformed = stringResource(R.string.common_not_informed)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.kitchen_info_title)) },
        shape = MaterialTheme.shapes.medium,
        containerColor = MaterialTheme.colorScheme.surface,
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                InfoLine(R.string.kitchen_info_customer, card.customerName ?: notInformed)
                InfoLine(R.string.kitchen_info_order, card.orderId)
                InfoLine(R.string.kitchen_info_opened_at, dateTimeText(card.openedAt, locale) ?: notInformed)
                InfoLine(R.string.kitchen_info_item, itemLabel(card))
                InfoLine(
                    R.string.kitchen_info_stage,
                    stringResource(
                        if (card.stage == KitchenStage.READY) {
                            R.string.item_status_ready
                        } else {
                            R.string.item_status_in_preparation
                        },
                    ),
                )
            }
        },
        confirmButton = {
            TozzoButton(text = stringResource(R.string.action_ok), onClick = onDismiss)
        },
    )
}

@Composable
private fun InfoLine(
    label: Int,
    value: String,
) {
    Column {
        Text(stringResource(label), style = MaterialTheme.typography.labelMedium)
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}
