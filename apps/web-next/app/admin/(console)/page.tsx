"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Crown,
  LayoutDashboard,
  Monitor,
  ReceiptText,
  RefreshCw,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";

import { formatFen } from "@shared/cloud/client";
import {
  AdminAvatar,
  AdminError,
  AdminLoading,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
  AdminStat,
  AdminTable,
  AdminTag,
  OrderStatusTag,
  channelLabel,
  formatDateTime,
  useAdminData,
} from "@/components/admin/admin-ui";
import { Button } from "@/components/admin/controls";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { adminClient } from "@/lib/admin-client";

export default function AdminDashboardPage() {
  const { data, error, loading, reload } = useAdminData(async () => {
    const [stats, orders, users] = await Promise.all([
      adminClient.admin.stats(),
      adminClient.admin.listOrders({ page: 1 }),
      adminClient.admin.listUsers({ page: 1 }),
    ]);
    return {
      ...stats,
      recentOrders: orders.items.slice(0, 8),
      recentUsers: users.items.slice(0, 6),
    };
  }, []);

  return (
    <AdminPage>
      <AdminPageHeader
        icon={LayoutDashboard}
        title="数据看板"
        description="收入、会员与设备的实时概况"
        actions={
          <Button
            variant="secondary"
            onClick={() => void reload()}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? "vg-spin" : undefined} />{" "}
            刷新
          </Button>
        }
      />
      {error ? (
        <AdminError message={error} onRetry={() => void reload()} />
      ) : null}

      <section className="vg-stats">
        <AdminStat
          icon={Wallet}
          label="今日收入"
          value={data ? formatFen(data.stats.revenueTodayFen) : "—"}
        />
        <AdminStat
          icon={TrendingUp}
          tone="blue"
          label="近 30 天收入"
          value={data ? formatFen(data.stats.revenue30dFen) : "—"}
          hint={data ? `${data.stats.paidOrders30d} 笔付费订单` : undefined}
        />
        <AdminStat
          icon={Crown}
          tone="violet"
          label="有效会员"
          value={data?.stats.activeSubscribers ?? "—"}
        />
        <AdminStat
          icon={Users}
          tone="amber"
          label="注册用户"
          value={data?.stats.users ?? "—"}
          hint={data ? `近 7 天新增 ${data.stats.newUsers7d}` : undefined}
        />
        <AdminStat
          icon={Monitor}
          label="在用设备"
          value={data?.stats.devices ?? "—"}
        />
      </section>

      <div className="vg-split">
        <div className="vg-stack">
          <AdminPanel
            icon={BarChart3}
            title="收入趋势"
            subtitle="按支付时间统计，北京时间"
          >
            {data ? (
              <RevenueChart data={data.stats.revenueTrend} />
            ) : (
              <div className="vg-skeleton h-[210px]" />
            )}
          </AdminPanel>
          <AdminPanel
            flush
            icon={ReceiptText}
            title="最近订单"
            actions={
              <Link
                href="/admin/orders"
                className="vg-btn vg-btn--ghost vg-btn--sm"
              >
                全部订单 <ArrowRight size={13} />
              </Link>
            }
          >
            {loading && !data ? (
              <AdminLoading />
            ) : (
              <AdminTable
                head={[
                  "订单号",
                  "账号",
                  "套餐",
                  { label: "金额", align: "right" },
                  "渠道",
                  "状态",
                  "时间",
                ]}
                empty={!data?.recentOrders.length}
                emptyText="还没有订单"
              >
                {data?.recentOrders.map((o) => (
                  <tr key={o.orderNo}>
                    <td className="admin-mono">{o.orderNo}</td>
                    <td>
                      <Link
                        className="admin-link"
                        href={`/admin/users/${o.userId}`}
                      >
                        {o.account}
                      </Link>
                    </td>
                    <td>{o.planName}</td>
                    <td className="num">{formatFen(o.amountFen)}</td>
                    <td className="text-[var(--theme-text-secondary)]">
                      {channelLabel(o.channel)}
                    </td>
                    <td>
                      <OrderStatusTag status={o.status} />
                    </td>
                    <td className="whitespace-nowrap text-[var(--theme-text-muted)]">
                      {formatDateTime(o.paidAt ?? o.createdAt)}
                    </td>
                  </tr>
                ))}
              </AdminTable>
            )}
          </AdminPanel>
        </div>

        <div className="vg-stack">
          <AdminPanel
            icon={UserPlus}
            title="新注册用户"
            actions={
              <Link
                href="/admin/users"
                className="vg-btn vg-btn--ghost vg-btn--sm"
              >
                全部 <ArrowRight size={13} />
              </Link>
            }
          >
            {loading && !data ? (
              <AdminLoading rows={3} />
            ) : data?.recentUsers.length ? (
              <div className="vg-list -mx-3">
                {data.recentUsers.map((u) => (
                  <Link
                    key={u.id}
                    href={`/admin/users/${u.id}`}
                    className="vg-list__item no-underline"
                  >
                    <AdminAvatar name={u.displayName || u.account} />
                    <span className="vg-list__main">
                      <span className="vg-list__title">{u.account}</span>
                      <span className="vg-list__sub">
                        {formatDateTime(u.createdAt)}
                      </span>
                    </span>
                    {u.role === "super_admin" || u.unlimited ? (
                      <AdminTag tone="info">不受限</AdminTag>
                    ) : u.planExpiresAt && u.planExpiresAt > Date.now() ? (
                      <AdminTag tone="success">会员</AdminTag>
                    ) : (
                      <AdminTag>未开通</AdminTag>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="vg-muted py-4 text-center">暂无用户</p>
            )}
          </AdminPanel>

          <AdminPanel icon={CalendarDays} title="支付渠道">
            <div className="vg-row">
              {data?.channels.length ? (
                data.channels.map((c) => (
                  <AdminTag
                    key={c}
                    tone={c === "mock" ? "warning" : "success"}
                    dot
                  >
                    {channelLabel(c)}
                  </AdminTag>
                ))
              ) : (
                <AdminTag tone="danger" dot>
                  未配置
                </AdminTag>
              )}
            </div>
            <p className="vg-muted mt-3 text-[12px]">
              微信 / 支付宝商户参数通过服务器环境变量配置，详见
              services/cloud/README.md。
            </p>
          </AdminPanel>
        </div>
      </div>
    </AdminPage>
  );
}
