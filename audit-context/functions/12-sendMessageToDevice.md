## `sendMessageToDevice` in `useBLE.ts` (L85-L135)

**Purpose:** Connects to the currently registered printer device, discovers services and characteristics, sends the print payload in base64 chunks over the first writable characteristic found, and disconnects. Without it, sale-print actions in history/detail flows would stop at generating text and never reach the hardware (`app/(tabs)/historico.tsx L133-L150`, `app/modais/contaHistoricoModal.tsx L128-L144`).

**Inputs & Assumptions:**
- `message` (`string`): already-formatted printable content. Trust: internal app-generated text from `formatarVendaParaImpressao`.
- `printer` (`any`): object expected to contain `uuid`. Trust: semi-trusted local DB read from `TB_IMPRESSORAS`.
- Preconditions:
  - `printer.uuid` exists for a registered printer (`useBLE.ts L86-L89`).
  - `connectToDevice()` can connect and discover services for that UUID (`L92-L96`; `connectToDevice()` is defined at `L60-L72`).

**Outputs & Effects:**
- Throws if no printer UUID is registered (`L86-L89`) or connection fails (`L92-L96`).
- Discovers all services and characteristics from the connected device (`L99-L104`).
- Sends the message as base64-encoded 20-character chunks to the first writable characteristic encountered (`L105-L121`).
- Throws if no writable characteristic is found (`L127-L129`).
- Disconnects from the printer UUID after sending (`L132-L134`).

**Block-by-Block:**

```ts
// L86-L96
if (!printer || !printer.uuid) {
  throw new Error('Nenhuma impressora padrão registrada no banco.');
}
const device: Device | null = await connectToDevice(printer.uuid);
if (!device) {
  throw new Error('Falha ao conectar à impressora.');
}
```
- **What:** Validates printer registration and establishes a BLE connection to the saved device UUID.
- **Why here:** Printing cannot proceed without a connected target device.
- **Assumes:** The saved UUID in `TB_IMPRESSORAS` still identifies the intended printer at runtime.
- **Establishes:** The function now has a connected BLE device to inspect for writable characteristics.
- **Depended on by:** The service/characteristic discovery and write loop below.

```ts
// L99-L117
const services = await device.services();
let messageSent = false;
for (const service of services) {
  const characteristics = await service.characteristics();
  for (const characteristic of characteristics) {
    if (characteristic.isWritableWithResponse || characteristic.isWritableWithoutResponse) {
      const base64Message = Buffer.from(message, 'utf-8').toString('base64');
      const chunkSize = 20;
      const chunks = base64Message.match(new RegExp(`.{1,${chunkSize}}`, 'g')) || [];
      for (const chunk of chunks) {
        await characteristic.writeWithResponse(chunk);
      }
      messageSent = true;
      break;
    }
  }
  if (messageSent) break;
}
```
- **What:** Enumerates device services and characteristics, chooses the first writable characteristic, base64-encodes the message, splits it into 20-character chunks, and writes each chunk with response.
- **Why here:** The app does not have a printer-specific characteristic UUID baked in, so it must discover a writable endpoint dynamically.
- **Assumes:** The first writable characteristic is the correct print transport and accepts base64 text chunked at 20 characters.
- **Establishes:** If `messageSent` becomes true, the full payload was handed to one characteristic on the connected device.
- **Depended on by:** The success path that skips the no-writable-characteristic error.

```ts
// L127-L134
if (!messageSent) {
  throw new Error('Nenhuma característica disponível para escrita encontrada.');
}
await disconnectFromDevice(printer.uuid);
console.log('Desconectado da impressora.');
```
- **What:** Rejects devices with no writable characteristic and disconnects after a successful send.
- **Why here:** The call should leave the connection cleanly closed after use.
- **Assumes:** Disconnecting by `printer.uuid` is valid after the earlier connection path.
- **Establishes:** Successful calls finish with the BLE connection cancelled.
- **Depended on by:** Caller flows that assume printing is a one-shot interaction rather than a persistent connection.

**Cross-Function Dependencies:**
- Callee `connectToDevice` / `disconnectFromDevice` (internal): connection lifecycle helpers (`useBLE.ts L60-L82`).
- Callee `Buffer.from(...).toString('base64')` and BLE characteristic write APIs (external-black-box): actual payload transport depends on these implementations.
- Callers: `HistoricoScreen.handlePrint()` (`app/(tabs)/historico.tsx L133-L150`) and `ContaHistoricoModal.handlePrint()` (`app/modais/contaHistoricoModal.tsx L128-L144`).
- Shared state: runtime BLE connection state in `BleManager`; persisted printer registration in `TB_IMPRESSORAS` is supplied by callers through `getPrinter()`.
- Invariant couplings: Printer registration from `usePrinterDatabase.setPrinter()` must keep a UUID that `connectToDevice()` can later resolve (`database/usePrinterDatabase.ts L8-L34`).

**Open Questions:**
- unclear; need to inspect the target printer protocol to confirm whether the app should prefer `writeWithoutResponse()` for some devices, because the current implementation always uses `writeWithResponse()` once a characteristic is deemed writable (`useBLE.ts L105-L116`).
