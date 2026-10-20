package uk.tozzo.app.core.sync

import com.powersync.PowerSyncDatabase
import com.powersync.connectors.PowerSyncBackendConnector
import com.powersync.connectors.PowerSyncCredentials
import com.powersync.db.crud.CrudEntry
import kotlinx.coroutines.CancellationException
import uk.tozzo.app.core.network.SyncApi
import uk.tozzo.app.core.network.toApiProblem
import uk.tozzo.app.core.session.DeviceIdentity
import uk.tozzo.app.core.session.SessionEvent
import uk.tozzo.app.core.session.SessionEvents
import javax.inject.Inject
import javax.inject.Singleton

/** Gives PowerSync its token and uploads the local queue to the API. */
@Singleton
class TozzoConnector
    @Inject
    constructor(
        private val api: SyncApi,
        private val deviceIdentity: DeviceIdentity,
        private val sessionEvents: SessionEvents,
    ) : PowerSyncBackendConnector() {
        /** A failure throws (the SDK retries); a deleted establishment or a due payment also ends the session. */
        @Suppress("TooGenericExceptionCaught")
        override suspend fun fetchCredentials(): PowerSyncCredentials {
            val token =
                try {
                    api.token()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    val problem = e.toApiProblem()
                    when {
                        problem?.status == GONE && problem.code == ESTABLISHMENT_DELETED ->
                            sessionEvents.emit(SessionEvent.EstablishmentDeleted)
                        problem?.status == PAYMENT_REQUIRED -> sessionEvents.emit(SessionEvent.PaymentRequired)
                    }
                    throw e
                }
            return PowerSyncCredentials(endpoint = token.endpoint, token = token.token)
        }

        /**
         * Uploads the queue in batches. A batch completes (deleting its ops) only after the API answered
         * and its rejections are in `sync_rejections`; a failure throws and the SDK sends it again.
         */
        override suspend fun uploadData(database: PowerSyncDatabase) {
            val processor = UploadProcessor(api, DatabaseRejectionSink(database), deviceIdentity::id)
            while (true) {
                val batch = database.getCrudBatch(BATCH_SIZE) ?: return
                processor.process(batch.crud.map { it.toPendingOp() })
                batch.complete(null)
            }
        }

        private fun CrudEntry.toPendingOp() = PendingOp(clientId, op.toJson(), table, id, opData?.typed)

        private companion object {
            const val BATCH_SIZE = 200
            const val GONE = 410
            const val PAYMENT_REQUIRED = 402
            const val ESTABLISHMENT_DELETED = "ESTABLISHMENT_DELETED"
        }
    }
