# Hardware compatibility matrix

| Device                            | Current POS support                                             | Planned interface and release proof                                                    |
| --------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Keyboard wedge scanner            | SKU search field accepts keyboard input; barcode mapping absent | Exact barcode field and ambiguity checks; real scan-to-cart test                       |
| Receipt / label / kitchen printer | None                                                            | Browser print or approved SDK/bridge, model/OS/browser matrix, jam/retry tests         |
| Cash drawer                       | None                                                            | Approved printer/bridge command, permission checks, audit and disconnected-state tests |
| Terminal                          | None                                                            | Named provider SDK/device, sandbox and physical transaction/refund proof               |
| Customer display / KDS            | None                                                            | Tenant/session scoped realtime channel, reconnect and privacy tests                    |
| Scale                             | None                                                            | Supported certified hardware adapter and precision/calibration proof                   |

No discovery or connection-test control is offered until it can test real hardware. No universal compatibility claim.
