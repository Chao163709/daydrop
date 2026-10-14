import type { Backup } from './backup';
// Reserved contract. No account, network request or synchronization is enabled.
export interface SyncProvider {
  pull(): Promise<Backup | null>;
  push(backup: Backup): Promise<void>;
}
