@file:Suppress("MatchingDeclarationName")

package uk.tozzo.app.feature.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import uk.tozzo.app.R
import uk.tozzo.app.core.sync.SyncState
import uk.tozzo.app.ui.theme.TozzoColors

data class SyncBadgeState(
    val state: SyncState,
    val rejections: Int,
)

internal const val SYNC_BADGE_TAG = "sync_badge"

/** Rounded outline chip with a state dot; rejections win over the sync state and make it tappable. */
@Composable
fun SyncBadge(
    badge: SyncBadgeState,
    onOpenRejections: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val hasRejections = badge.rejections > 0
    val text =
        if (hasRejections) {
            pluralStringResource(R.plurals.sync_rejections, badge.rejections, badge.rejections)
        } else {
            stringResource(badge.state.label())
        }
    val dot = if (hasRejections) TozzoColors.danger else badge.state.color()
    val clickable =
        if (hasRejections) {
            Modifier.clickable(role = Role.Button, onClick = onOpenRejections)
        } else {
            Modifier
        }
    Row(
        modifier =
            modifier
                .testTag(SYNC_BADGE_TAG)
                .semantics(mergeDescendants = true) {}
                .clip(CHIP_SHAPE)
                .border(1.dp, MaterialTheme.colorScheme.outline, CHIP_SHAPE)
                .then(clickable)
                .padding(horizontal = 10.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(8.dp).background(dot, CircleShape))
        Text(text, style = MaterialTheme.typography.labelMedium)
    }
}

private val CHIP_SHAPE = RoundedCornerShape(percent = 50)

private fun SyncState.label(): Int =
    when (this) {
        SyncState.SYNCED -> R.string.sync_synced
        SyncState.SYNCING -> R.string.sync_syncing
        SyncState.OFFLINE -> R.string.sync_offline
        SyncState.FIRST_SYNC_PENDING -> R.string.sync_pending_first
    }

private fun SyncState.color(): Color =
    when (this) {
        SyncState.SYNCED -> TozzoColors.success
        SyncState.SYNCING, SyncState.FIRST_SYNC_PENDING -> TozzoColors.warning
        SyncState.OFFLINE -> TozzoColors.danger
    }
