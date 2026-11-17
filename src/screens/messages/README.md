# Messages module

Unified LinkBooks collaboration workspace.

- Routes: `/messages`, `/messages/settings`
- Server: `src/lib/messaging/messaging.functions.ts`
- Schema: `messaging_*` migrations
- Docs: `docs/chat/`

Primary actions stay fail-closed until messaging is enabled for the organisation and the actor has messaging permissions. Chat text never posts, pays or formally approves.
