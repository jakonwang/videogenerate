import { AccountShell } from '@/components/account-center/account-shell'

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AccountShell>{children}</AccountShell>
}
