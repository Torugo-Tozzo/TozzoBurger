@file:Suppress("MaxLineLength", "ktlint:standard:max-line-length")

package uk.tozzo.app.ui.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp
import uk.tozzo.app.domain.AppDestination

/**
 * The navigation icons of the web app (Lucide, ISC license), as 24 dp stroke vectors. Circles,
 * lines and rectangles of the originals are written as paths. The tint comes from the `Icon`.
 */
object TozzoIcons {
    val Menu: ImageVector by lazy {
        lucide(
            "Menu",
            "M4 12L20 12",
            "M4 6L20 6",
            "M4 18L20 18",
        )
    }

    val MoreVertical: ImageVector by lazy {
        lucide(
            "MoreVertical",
            "M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
            "M11 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
            "M11 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
        )
    }

    val Info: ImageVector by lazy {
        lucide("Info", "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0", "M12 16v-4", "M12 8h.01")
    }

    val Plus: ImageVector by lazy { lucide("Plus", "M5 12h14", "M12 5v14") }

    val Minus: ImageVector by lazy { lucide("Minus", "M5 12h14") }

    val Trash: ImageVector by lazy {
        lucide(
            "Trash",
            "M3 6h18",
            "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",
            "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",
            "M10 11v6",
            "M14 11v6",
        )
    }

    val Sell: ImageVector by lazy {
        lucide(
            "Sell",
            "M7 21a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
            "M18 21a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
            "M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12",
        )
    }

    val Orders: ImageVector by lazy {
        lucide(
            "Orders",
            "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1Z",
            "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
            "M12 11h4",
            "M12 16h4",
            "M8 11h.01",
            "M8 16h.01",
        )
    }

    val Kitchen: ImageVector by lazy {
        lucide(
            "Kitchen",
            "M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z",
            "M6 17L18 17",
        )
    }

    val Deliveries: ImageVector by lazy {
        lucide(
            "Deliveries",
            "M15 17.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0",
            "M2 17.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0",
            "M14 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
            "M12 17.5V14l-3-3 4-3 2 3h2",
        )
    }

    val Sales: ImageVector by lazy {
        lucide(
            "Sales",
            "M12 2L12 22",
            "M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
        )
    }

    val ServiceOrders: ImageVector by lazy {
        lucide(
            "ServiceOrders",
            "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1Z",
            "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
            "M12 11h4",
            "M12 16h4",
            "M8 11h.01",
            "M8 16h.01",
        )
    }

    val Estimates: ImageVector by lazy {
        lucide(
            "Estimates",
            "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",
            "M14 2v4a2 2 0 0 0 2 2h4",
            "M10 9H8",
            "M16 13H8",
            "M16 17H8",
        )
    }

    val Products: ImageVector by lazy {
        lucide(
            "Products",
            "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z",
            "M3 6h18",
            "M16 10a4 4 0 0 1-8 0",
        )
    }

    val Services: ImageVector by lazy {
        lucide(
            "Services",
            "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
        )
    }

    val Schedule: ImageVector by lazy {
        lucide(
            "Schedule",
            "M8 2v4",
            "M16 2v4",
            "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z",
            "M3 10h18",
            "M8 14h.01",
            "M12 14h.01",
            "M16 14h.01",
            "M8 18h.01",
            "M12 18h.01",
            "M16 18h.01",
        )
    }

    val Reports: ImageVector by lazy {
        lucide(
            "Reports",
            "M3 3v18h18",
            "M18 17V9",
            "M13 17V5",
            "M8 17v-3",
        )
    }

    val Employees: ImageVector by lazy {
        lucide(
            "Employees",
            "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
            "M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
            "M22 21v-2a4 4 0 0 0-3-3.87",
            "M16 3.13a4 4 0 0 1 0 7.75",
        )
    }

    val Devices: ImageVector by lazy {
        lucide(
            "Devices",
            "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2Z",
            "M12 18h.01",
        )
    }

    val Settings: ImageVector by lazy {
        lucide(
            "Settings",
            "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
            "M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
        )
    }

    /** One icon per destination: the drawer shows it beside the label. */
    @Suppress("CyclomaticComplexMethod")
    fun forDestination(destination: AppDestination): ImageVector =
        when (destination) {
            AppDestination.SELL -> Sell
            AppDestination.ORDERS -> Orders
            AppDestination.KITCHEN -> Kitchen
            AppDestination.DELIVERIES -> Deliveries
            AppDestination.SALES -> Sales
            AppDestination.SERVICE_ORDERS -> ServiceOrders
            AppDestination.ESTIMATES -> Estimates
            AppDestination.PRODUCTS -> Products
            AppDestination.SERVICES -> Services
            AppDestination.SCHEDULE -> Schedule
            AppDestination.REPORTS -> Reports
            AppDestination.EMPLOYEES -> Employees
            AppDestination.DEVICES -> Devices
            AppDestination.SETTINGS -> Settings
        }
}

private const val ICON_SIZE = 24

private fun lucide(
    name: String,
    vararg paths: String,
): ImageVector =
    ImageVector
        .Builder(name, ICON_SIZE.dp, ICON_SIZE.dp, ICON_SIZE.toFloat(), ICON_SIZE.toFloat())
        .apply {
            paths.forEach {
                addPath(
                    pathData = addPathNodes(it),
                    stroke = SolidColor(Color.Black),
                    strokeLineWidth = 2f,
                    strokeLineCap = StrokeCap.Round,
                    strokeLineJoin = StrokeJoin.Round,
                )
            }
        }.build()
