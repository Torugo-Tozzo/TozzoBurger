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
                    emitSessionEvent(e)
                    throw e
                }
            return PowerSyncCredentials(endpoint = token.endpoint, token = token.token)
        }

        /**
         * Uploads the queue in batches. A batch completes (deleting its ops) only after the API answered
         * and its rejections are in `sync_rejections`; a failure throws and the SDK sends it again.
         */
        override suspend fun uploadData(database: PowerSyncDatabase) {
            val sink = DatabaseRejectionSink { sql, params -> database.execute(sql, params) }
            while (true) {
                val batch = database.getCrudBatch(BATCH_SIZE) ?: return
                uploadOps(batch.crud.map { it.toPendingOp() }, sink)
                batch.complete(null)
            }
        }

        /**
         * Uploads [ops] and records the rejected ones in [sink]. A deleted establishment (410) or a due
         * payment (402) also ends the session, and the failure still throws, so the batch is not completed.
         */
        @Suppress("TooGenericExceptionCaught")
        internal suspend fun uploadOps(
            ops: List<PendingOp>,
            sink: RejectionSink,
        ) {
            try {
                UploadProcessor(api, sink, deviceIdentity::id).process(ops)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                emitSessionEvent(e)
                throw e
            }
        }

        private suspend fun emitSessionEvent(e: Exception) {
            val problem = e.toApiProblem()
            when {
                problem?.status == GONE && problem.code == ESTABLISHMENT_DELETED ->
                    sessionEvents.emit(SessionEvent.EstablishmentDeleted)
                problem?.status == PAYMENT_REQUIRED -> sessionEvents.emit(SessionEvent.PaymentRequired)
            }
        }

        private fun CrudEntry.toPendingOp() =
            PendingOp(clientId, op.toJson(), table, id, opData?.typed, previousValues?.typed)

        private companion object {
            const val BATCH_SIZE = 200
            const val GONE = 410
            const val PAYMENT_REQUIRED = 402
            const val ESTABLISHMENT_DELETED = "ESTABLISHMENT_DELETED"
        }
    }
