import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Image,
  Modal,
  TextInput,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import Feather from "@react-native-vector-icons/feather";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { api, formatIDR, shortIDR } from "@/src/api";
import { colors } from "@/src/theme";
import { categoryMeta } from "@/src/categories";
import { CategoryIcon } from "@/src/components/CategoryIcon";
import { CashFlowChart } from "@/src/components/CashFlowChart";
import { LineChart } from "react-native-gifted-charts";
import { useResponsive } from "@/src/responsive";

const LOGO = require("../../assets/images/icon.png");

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const summary = useQuery({
    queryKey: ["summary"],
    queryFn: () => api.summary(),
  });
  const txs = useQuery({
    queryKey: ["transactions", { limit: 5 }],
    queryFn: () => api.listTransactions({ limit: "5" }),
  });
  const upcoming = useQuery({
    queryKey: ["upcoming"],
    queryFn: () => api.upcomingBills(7),
  });
  const tips = useQuery({
    queryKey: ["ai-tips"],
    queryFn: () => api.aiTips(),
    staleTime: 1000 * 60 * 60,
  });

  const refreshTips = useMutation({
    mutationFn: () => api.aiTips(),
    onSuccess: (data) => qc.setQueryData(["ai-tips"], data),
  });

  const market = useQuery({
    queryKey: ["market"],
    queryFn: () => api.marketIndicators(),
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 5,
  });
  const [selectedInd, setSelectedInd] = useState<any | null>(null);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      summary.refetch(),
      txs.refetch(),
      upcoming.refetch(),
    ]);
    setRefreshing(false);
  };

  const s = summary.data;
  const recent: any[] = txs.data || [];
  const bills: any[] = upcoming.data || [];
  const { isWide } = useResponsive();

  const accountsBlock = (
    <View style={styles.accountsRow}>
      <AccountCard
        label="Rekening Pribadi"
        icon="user"
        accent={colors.brand}
        net={s?.by_scope?.personal?.net || 0}
        income={s?.by_scope?.personal?.income || 0}
        expense={s?.by_scope?.personal?.expense || 0}
        ready={!!s}
        testID="account-personal"
      />
      <AccountCard
        label="Rekening Perusahaan"
        icon="briefcase"
        accent={colors.brandPrimary}
        net={s?.by_scope?.business?.net || 0}
        income={s?.by_scope?.business?.income || 0}
        expense={s?.by_scope?.business?.expense || 0}
        ready={!!s}
        testID="account-business"
      />
    </View>
  );

  const aiBlock = (
    <View style={styles.aiCard} testID="ai-tips-card">
      <LinearGradient
        colors={["#1a3a5c", "#1f8a9e"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.aiHeader}
      >
        <View style={styles.aiHeaderLeft}>
          <View style={styles.aiIconBadge}>
            <Feather name="zap" size={15} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.aiTitle}>Tips Hemat AI</Text>
            <Text style={styles.aiSub}>Saran cerdas dari pola keuanganmu</Text>
          </View>
        </View>
        <Pressable
          onPress={() => refreshTips.mutate()}
          hitSlop={10}
          testID="refresh-tips"
          style={styles.aiRefresh}
        >
          <Feather name="refresh-cw" size={15} color="#fff" />
        </Pressable>
      </LinearGradient>
      <View style={styles.aiBody}>
        {tips.isLoading || refreshTips.isPending ? (
          <View style={styles.rowCenter}>
            <ActivityIndicator color={colors.brandPrimary} />
            <Text style={styles.aiLoading}>Menganalisis keuanganmu...</Text>
          </View>
        ) : (
          <Text style={styles.tipText}>{tips.data?.tips || "Belum ada tips."}</Text>
        )}
      </View>
    </View>
  );

  const billsBlock =
    bills.length > 0 ? (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.rowCenter}>
            <Feather name="bell" size={16} color={colors.warning} />
            <Text style={styles.cardTitle}>Tagihan Segera Jatuh Tempo</Text>
          </View>
        </View>
        {bills.slice(0, 3).map((b) => (
          <View key={b.id} style={styles.billRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.billName}>{b.name}</Text>
              <Text style={styles.billMeta}>
                Tanggal {b.due_day} • {b.days_left === 0 ? "Hari ini" : `${b.days_left} hari lagi`}
              </Text>
            </View>
            <Text style={styles.billAmount}>{formatIDR(b.amount)}</Text>
          </View>
        ))}
      </View>
    ) : null;

  const recentBlock = (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Transaksi Terbaru</Text>
        <Pressable onPress={() => router.push("/(tabs)/transactions")}>
          <Text style={styles.link}>Lihat semua</Text>
        </Pressable>
      </View>
      {recent.length === 0 ? (
        <Text style={styles.empty}>Belum ada transaksi.</Text>
      ) : (
        recent.map((t) => {
          const meta = categoryMeta(t.category);
          return (
            <View key={t.id} style={styles.txRow}>
              <CategoryIcon name={meta.icon} color={meta.color} size={16} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.txTitle}>{t.description || meta.label}</Text>
                <Text style={styles.txMeta}>
                  {meta.label} • {t.scope === "business" ? "Bisnis" : "Pribadi"}
                </Text>
              </View>
              <Text
                style={[
                  styles.txAmount,
                  { color: t.type === "income" ? colors.success : colors.error },
                ]}
              >
                {t.type === "income" ? "+" : "-"}
                {shortIDR(t.amount)}
              </Text>
            </View>
          );
        })
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <LinearGradient
          colors={["#0f2540", "#1a3a5c", "#1f8a9e"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 16 }]}
        >
          <View style={styles.headerRow}>
            <View style={styles.brandRow}>
              <View style={styles.logoBadge}>
                <Image source={LOGO} style={styles.logo} resizeMode="contain" />
              </View>
              <View>
                <Text style={styles.brandTitle}>HENZA FINTECH</Text>
                <Text style={styles.brandSub}>Financial Management</Text>
              </View>
            </View>
          </View>

          <Text style={styles.balanceLabel}>Total Kekayaan Bersih</Text>
          <Text style={styles.balanceValue} testID="total-wealth">
            {s ? formatIDR(s.total_wealth) : "..."}
          </Text>

          <View style={styles.statRow}>
            <View style={styles.statBox}>
              <View style={styles.statIcon}>
                <Feather name="arrow-down-left" size={14} color={colors.success} />
              </View>
              <View>
                <Text style={styles.statLabel}>Pemasukan</Text>
                <Text style={styles.statValue}>
                  {s ? shortIDR(s.total_income) : "-"}
                </Text>
              </View>
            </View>
            <View style={styles.statBox}>
              <View style={styles.statIcon}>
                <Feather name="arrow-up-right" size={14} color={colors.error} />
              </View>
              <View>
                <Text style={styles.statLabel}>Pengeluaran</Text>
                <Text style={styles.statValue}>
                  {s ? shortIDR(s.total_expense) : "-"}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.ratioBar}>
            <View
              style={[
                styles.ratioFill,
                { width: `${Math.min(100, (s?.expense_ratio || 0) * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.ratioText}>
            Rasio Pengeluaran: {s ? Math.round((s.expense_ratio || 0) * 100) : 0}%
          </Text>
        </LinearGradient>

        {/* Market indicators */}
        <MarketStrip
          data={market.data?.indicators || []}
          loading={market.isLoading}
          onSelect={setSelectedInd}
        />

        {/* Quick actions */}
        <View style={styles.quickRow}>
          <QuickAction
            icon="plus-circle"
            label="Pemasukan"
            color={colors.success}
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/transaction-form?type=income");
            }}
            testID="qa-income"
          />
          <QuickAction
            icon="minus-circle"
            label="Pengeluaran"
            color={colors.error}
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/transaction-form?type=expense");
            }}
            testID="qa-expense"
          />
          <QuickAction
            icon="credit-card"
            label="Aset"
            color={colors.brandPrimary}
            onPress={() => router.push("/(tabs)/more")}
            testID="qa-assets"
          />
          <QuickAction
            icon="calendar"
            label="Tagihan"
            color={colors.warning}
            onPress={() => router.push("/(tabs)/more")}
            testID="qa-bills"
          />
        </View>

        {/* Dashboard body — 2-column on tablet landscape / desktop */}
        {isWide ? (
          <View style={styles.twoColWrap}>
            <View style={styles.twoCol}>
              <View style={styles.col}>
                {accountsBlock}
                {aiBlock}
                {billsBlock}
              </View>
              <View style={styles.col}>
                <CashFlowChart />
                {recentBlock}
              </View>
            </View>
          </View>
        ) : (
          <>
            {accountsBlock}
            {aiBlock}
            <CashFlowChart />
            {billsBlock}
            {recentBlock}
          </>
        )}
      </ScrollView>

      <IndicatorSheet
        indicator={selectedInd}
        onClose={() => setSelectedInd(null)}
      />
    </View>
  );
}

const IND_ICONS: Record<string, string> = {
  bi_rate: "percent",
  inflation: "trending-up",
  sbn10y: "file-text",
  gold: "circle",
  jci: "activity",
};

function fmtIndicator(ind: any): string {
  if (ind.value == null) return "—";
  if (ind.format === "percent") return `${ind.value}%`;
  if (ind.format === "idr") return shortIDR(ind.value);
  if (ind.format === "number")
    return Number(ind.value).toLocaleString("id-ID", { maximumFractionDigits: 0 });
  return String(ind.value);
}

function MarketStrip({
  data,
  loading,
  onSelect,
}: {
  data: any[];
  loading: boolean;
  onSelect: (ind: any) => void;
}) {
  if (loading && data.length === 0) {
    return (
      <View style={styles.stripLoading}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }
  if (!data.length) return null;
  return (
    <View style={{ marginTop: 18 }}>
      <View style={styles.stripHeadRow}>
        <Text style={styles.sectionLabel}>Indikator Pasar</Text>
        <Text style={styles.stripHint}>ketuk untuk detail</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stripRow}
      >
        {data.map((ind) => {
          const chg = ind.change_pct;
          const hasChg = typeof chg === "number";
          const up = hasChg && chg >= 0;
          return (
            <Pressable
              key={ind.key}
              style={styles.indCard}
              onPress={() => onSelect(ind)}
              testID={`indicator-${ind.key}`}
            >
              <View style={styles.indTop}>
                <View style={styles.indIcon}>
                  <Feather
                    name={(IND_ICONS[ind.key] || "bar-chart-2") as any}
                    size={12}
                    color={colors.brandPrimary}
                  />
                </View>
                <Text style={styles.indLabel} numberOfLines={1}>
                  {ind.label}
                </Text>
              </View>
              <Text style={styles.indValue} numberOfLines={1}>
                {fmtIndicator(ind)}
              </Text>
              {hasChg ? (
                <View style={styles.indChgRow}>
                  <Feather
                    name={up ? "trending-up" : "trending-down"}
                    size={11}
                    color={up ? colors.success : colors.error}
                  />
                  <Text style={[styles.indChg, { color: up ? colors.success : colors.error }]}>
                    {up ? "+" : ""}
                    {chg}%
                  </Text>
                </View>
              ) : (
                <Text style={styles.indAsof} numberOfLines={1}>
                  {ind.as_of || ""}
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function AccountCard({
  label,
  icon,
  accent,
  net,
  income,
  expense,
  ready,
  testID,
}: {
  label: string;
  icon: string;
  accent: string;
  net: number;
  income: number;
  expense: number;
  ready: boolean;
  testID: string;
}) {
  return (
    <View style={styles.accountCard} testID={`${testID}-card`}>
      <View style={[styles.accountAccent, { backgroundColor: accent }]} />
      <View style={styles.accountHead}>
        <View style={[styles.accountIcon, { backgroundColor: `${accent}18` }]}>
          <Feather name={icon as any} size={15} color={accent} />
        </View>
        <Text style={styles.accountLabel}>{label}</Text>
      </View>
      <Text style={[styles.accountValue, { color: accent }]} testID={`${testID}-value`}>
        {ready ? formatIDR(net) : "..."}
      </Text>
      <View style={styles.accountDivider} />
      <View style={styles.accountMetaRow}>
        <View style={styles.metaPill}>
          <Feather name="arrow-down-left" size={11} color={colors.success} />
          <Text style={styles.metaIn}>{ready ? shortIDR(income) : "-"}</Text>
        </View>
        <View style={styles.metaPill}>
          <Feather name="arrow-up-right" size={11} color={colors.error} />
          <Text style={styles.metaOut}>{ready ? shortIDR(expense) : "-"}</Text>
        </View>
      </View>
    </View>
  );
}

function IndicatorSheet({
  indicator,
  onClose,
}: {
  indicator: any | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [editMode, setEditMode] = useState(false);
  const [val, setVal] = useState("");
  const [asof, setAsof] = useState("");
  const [loanAmt, setLoanAmt] = useState("");
  const [loanTenor, setLoanTenor] = useState("12");
  const [loanRate, setLoanRate] = useState("");

  useEffect(() => {
    if (indicator) {
      setEditMode(false);
      setVal(indicator.value != null ? String(indicator.value) : "");
      setAsof(indicator.as_of || "");
      setLoanAmt("");
      setLoanTenor("12");
      setLoanRate(
        indicator.key === "bi_rate" && indicator.value != null ? String(indicator.value) : ""
      );
    }
  }, [indicator]);

  const isChartable = !!indicator && (indicator.key === "gold" || indicator.key === "jci");
  const history = useQuery({
    queryKey: ["market-history", indicator?.key],
    queryFn: () => api.marketHistory(indicator.key),
    enabled: isChartable,
    staleTime: 1000 * 60 * 5,
  });
  const points: any[] = history.data?.points || [];
  const chartData = points.map((p) => ({ value: p.value, label: p.label }));
  const chartWidth = Math.min(width - 88, 460);

  const isLoan = !!indicator && indicator.key === "bi_rate";
  const loanP = parseFloat(loanAmt.replace(/\./g, "")) || 0;
  const loanN = parseInt(loanTenor) || 0;
  const loanAnnual = parseFloat(loanRate.replace(",", ".")) || 0;
  const rMonthly = loanAnnual / 100 / 12;
  let monthly = 0;
  if (loanP > 0 && loanN > 0)
    monthly = rMonthly > 0 ? (loanP * rMonthly) / (1 - Math.pow(1 + rMonthly, -loanN)) : loanP / loanN;
  const totalPay = monthly * loanN;

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, any> = {};
      body[indicator.key] = parseFloat(val.replace(",", ".")) || 0;
      body[`${indicator.key}_asof`] = asof;
      return api.updateMarketConfig(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["market"] });
      onClose();
    },
  });

  const asofDisplay =
    indicator?.as_of && String(indicator.as_of).includes("T")
      ? new Date(indicator.as_of).toLocaleString("id-ID")
      : indicator?.as_of || "-";

  return (
    <Modal visible={!!indicator} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.indSheet, { paddingBottom: insets.bottom + 20 }]}>
          {indicator && (
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              <View style={styles.indSheetHead}>
                <Text style={styles.indSheetTitle}>{indicator.label}</Text>
                <Pressable onPress={onClose} hitSlop={10}>
                  <Feather name="x" size={22} color={colors.onSurface} />
                </Pressable>
              </View>

              <Text style={styles.indSheetValue}>{fmtIndicator(indicator)}</Text>
              {typeof indicator.change_pct === "number" && (
                <Text
                  style={[
                    styles.indSheetChg,
                    { color: indicator.change_pct >= 0 ? colors.success : colors.error },
                  ]}
                >
                  {indicator.change_pct >= 0 ? "▲ +" : "▼ "}
                  {indicator.change_pct}% hari ini
                </Text>
              )}

              <Text style={styles.indSheetNote}>{indicator.note}</Text>

              <View style={styles.indMetaRow}>
                <Feather name="database" size={13} color={colors.muted} />
                <Text style={styles.indMetaText}>{indicator.source}</Text>
              </View>
              <View style={styles.indMetaRow}>
                <Feather name="clock" size={13} color={colors.muted} />
                <Text style={styles.indMetaText}>Per {asofDisplay}</Text>
              </View>

              {isChartable && (
                <View style={styles.chartWrap}>
                  {history.isLoading ? (
                    <ActivityIndicator color={colors.brandPrimary} style={{ paddingVertical: 30 }} />
                  ) : chartData.length > 1 ? (
                    <>
                      <Text style={styles.chartTitle}>
                        Tren {indicator.label} · {chartData.length} hari terakhir
                      </Text>
                      <LineChart
                        data={chartData}
                        width={chartWidth}
                        height={140}
                        thickness={2.5}
                        color={colors.brandPrimary}
                        areaChart
                        startFillColor={colors.brandPrimary}
                        endFillColor={colors.brandPrimary}
                        startOpacity={0.2}
                        endOpacity={0.02}
                        curved
                        hideDataPoints
                        hideRules
                        xAxisColor={colors.border}
                        yAxisColor={colors.border}
                        yAxisTextStyle={{ color: colors.muted, fontSize: 9 }}
                        xAxisLabelTextStyle={{ color: colors.muted, fontSize: 8 }}
                        noOfSections={3}
                        formatYLabel={(v: any) =>
                          indicator.key === "gold"
                            ? shortIDR(parseFloat(v)).replace("Rp ", "")
                            : Number(parseFloat(v)).toLocaleString("id-ID", {
                                maximumFractionDigits: 0,
                              })
                        }
                      />
                    </>
                  ) : (
                    <Text style={styles.chartEmpty}>Data tren belum tersedia.</Text>
                  )}
                </View>
              )}

              {indicator.editable && !editMode && (
                <Pressable
                  style={styles.editLink}
                  onPress={() => setEditMode(true)}
                  testID={`edit-indicator-${indicator.key}`}
                >
                  <Feather name="edit-2" size={14} color={colors.brandPrimary} />
                  <Text style={styles.editLinkText}>Perbarui nilai</Text>
                </Pressable>
              )}

              {indicator.editable && editMode && (
                <View style={{ marginTop: 14 }}>
                  <Text style={styles.editLabel}>Nilai (%)</Text>
                  <TextInput
                    value={val}
                    onChangeText={(v) => setVal(v.replace(/[^0-9.,]/g, ""))}
                    keyboardType="numeric"
                    style={styles.editInput}
                    placeholderTextColor={colors.muted}
                    testID="indicator-value-input"
                  />
                  <Text style={styles.editLabel}>Per (mis. Agu 2026)</Text>
                  <TextInput
                    value={asof}
                    onChangeText={setAsof}
                    style={styles.editInput}
                    placeholderTextColor={colors.muted}
                    testID="indicator-asof-input"
                  />
                  <Pressable
                    style={styles.indSaveBtn}
                    onPress={() => save.mutate()}
                    testID="save-indicator-btn"
                  >
                    <Text style={styles.indSaveText}>
                      {save.isPending ? "Menyimpan..." : "Simpan"}
                    </Text>
                  </Pressable>
                </View>
              )}

              {isLoan && (
                <View style={styles.loanBox}>
                  <Text style={styles.loanTitle}>Kalkulator Cicilan</Text>
                  <Text style={styles.loanHint}>
                    Estimasi cepat pakai suku bunga acuan (bisa diubah).
                  </Text>
                  <Text style={styles.editLabel}>Jumlah Pinjaman (Rp)</Text>
                  <TextInput
                    value={loanAmt}
                    onChangeText={(v) =>
                      setLoanAmt(
                        v.replace(/[^0-9]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".")
                      )
                    }
                    keyboardType="number-pad"
                    style={styles.editInput}
                    placeholder="0"
                    placeholderTextColor={colors.muted}
                    testID="loan-amount-input"
                  />
                  <View style={styles.loanRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.editLabel}>Tenor (bulan)</Text>
                      <TextInput
                        value={loanTenor}
                        onChangeText={(v) => setLoanTenor(v.replace(/[^0-9]/g, ""))}
                        keyboardType="number-pad"
                        style={styles.editInput}
                        placeholderTextColor={colors.muted}
                        testID="loan-tenor-input"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.editLabel}>Bunga/thn (%)</Text>
                      <TextInput
                        value={loanRate}
                        onChangeText={(v) => setLoanRate(v.replace(/[^0-9.,]/g, ""))}
                        keyboardType="numeric"
                        style={styles.editInput}
                        placeholderTextColor={colors.muted}
                        testID="loan-rate-input"
                      />
                    </View>
                  </View>
                  <View style={styles.loanResult}>
                    <View>
                      <Text style={styles.loanResLabel}>Cicilan / bulan</Text>
                      <Text style={styles.loanResValue} testID="loan-monthly">
                        {monthly > 0 ? formatIDR(Math.round(monthly)) : "—"}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.loanResLabel}>Total bayar</Text>
                      <Text style={styles.loanResTotal}>
                        {totalPay > 0 ? formatIDR(Math.round(totalPay)) : "—"}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function QuickAction({
  icon,
  label,
  color,
  onPress,
  testID,
}: {
  icon: string;
  label: string;
  color: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable style={styles.qa} onPress={onPress} testID={testID}>
      <View style={[styles.qaIcon, { backgroundColor: `${color}18` }]}>
        <Feather name={icon as any} size={20} color={color} />
      </View>
      <Text style={styles.qaLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    elevation: 3,
  },
  logo: { width: 50, height: 50 },
  brandTitle: { color: "#fff", fontWeight: "800", fontSize: 16, letterSpacing: 0.8 },
  brandSub: { color: "rgba(255,255,255,0.7)", fontSize: 11 },
  balanceLabel: { color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 4 },
  balanceValue: { color: "#fff", fontSize: 30, fontWeight: "700", marginTop: 4 },
  statRow: { flexDirection: "row", gap: 12, marginTop: 16 },
  statBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    padding: 10,
    borderRadius: 12,
    gap: 8,
  },
  statIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  statLabel: { color: "rgba(255,255,255,0.7)", fontSize: 10 },
  statValue: { color: "#fff", fontWeight: "700", fontSize: 13 },
  ratioBar: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 999,
    marginTop: 14,
    overflow: "hidden",
  },
  ratioFill: { height: "100%", backgroundColor: colors.warning },
  ratioText: { color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 6 },

  quickRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginTop: 16,
    justifyContent: "space-between",
  },
  qa: { alignItems: "center", flex: 1 },
  qaIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  qaLabel: { fontSize: 11, color: colors.onSurfaceSecondary, fontWeight: "500" },

  accountsRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  accountCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: 18,
    paddingHorizontal: 14,
    paddingBottom: 12,
    overflow: "hidden",
    elevation: 2,
  },
  accountAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 4 },
  accountDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginTop: 10,
  },
  metaPill: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaIn: { fontSize: 11, fontWeight: "700", color: colors.success },
  metaOut: { fontSize: 11, fontWeight: "700", color: colors.error },
  accountHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  accountIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  accountLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.onSurfaceSecondary,
    flex: 1,
  },
  accountValue: { fontSize: 18, fontWeight: "800" },
  accountMetaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  accountMetaIn: { fontSize: 11, fontWeight: "700", color: colors.success },
  accountMetaOut: { fontSize: 11, fontWeight: "700", color: colors.error },

  card: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.onSurface,
    marginLeft: 6,
  },
  rowCenter: { flexDirection: "row", alignItems: "center" },
  link: { color: colors.brandPrimary, fontSize: 12, fontWeight: "600" },
  tipText: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 20 },
  empty: { color: colors.muted, fontSize: 12, textAlign: "center", padding: 16 },
  legendRow: { flexDirection: "row", gap: 16, marginTop: 8, justifyContent: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  legendText: { fontSize: 11, color: colors.muted },

  billRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  billName: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  billMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  billAmount: { fontSize: 13, fontWeight: "700", color: colors.warning },

  txRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  txTitle: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  txMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  txAmount: { fontSize: 13, fontWeight: "700" },

  /* Market indicators strip */
  stripLoading: { marginTop: 18, alignItems: "center", justifyContent: "center", height: 60 },
  stripHeadRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  sectionLabel: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  stripHint: { fontSize: 11, color: colors.muted, fontStyle: "italic" },
  stripRow: { paddingHorizontal: 16, gap: 10 },
  indCard: {
    width: 132,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    flexShrink: 0,
  },
  indTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  indIcon: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  indLabel: { flex: 1, fontSize: 11, fontWeight: "600", color: colors.muted },
  indValue: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  indChgRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 },
  indChg: { fontSize: 11, fontWeight: "700" },
  indAsof: { fontSize: 10, color: colors.muted, marginTop: 4 },

  /* AI card */
  aiCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  aiHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  aiHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  aiIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  aiTitle: { color: "#fff", fontSize: 14, fontWeight: "800" },
  aiSub: { color: "rgba(255,255,255,0.75)", fontSize: 10, marginTop: 1 },
  aiRefresh: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  aiBody: { backgroundColor: colors.surface, padding: 16 },
  aiLoading: { color: colors.muted, fontSize: 12, marginLeft: 10 },

  /* Indicator detail sheet */
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  indSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "90%",
  },
  indSheetHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  indSheetTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  indSheetValue: { fontSize: 32, fontWeight: "800", color: colors.brand, marginTop: 4 },
  indSheetChg: { fontSize: 13, fontWeight: "700", marginTop: 4 },
  indSheetNote: {
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    lineHeight: 20,
    marginTop: 12,
    marginBottom: 8,
  },
  indMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  indMetaText: { fontSize: 12, color: colors.muted },
  editLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
    alignSelf: "flex-start",
  },
  editLinkText: { fontSize: 13, fontWeight: "700", color: colors.brandPrimary },
  editLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.onSurfaceSecondary,
    marginTop: 10,
    marginBottom: 6,
  },
  editInput: {
    height: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    color: colors.onSurface,
    fontSize: 14,
  },
  indSaveBtn: {
    height: 48,
    backgroundColor: colors.brand,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  indSaveText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  /* Responsive desktop layout */
  twoColWrap: { width: "100%", maxWidth: 1180, alignSelf: "center" },
  twoCol: { flexDirection: "row", alignItems: "flex-start" },
  col: { flex: 1, minWidth: 0 },

  /* Indicator history chart + loan calc */
  chartWrap: { marginTop: 14, alignItems: "center" },
  chartTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.onSurface,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  chartEmpty: { fontSize: 12, color: colors.muted, paddingVertical: 20 },
  loanBox: {
    marginTop: 16,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 14,
    padding: 14,
  },
  loanTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  loanHint: { fontSize: 11, color: colors.muted, marginTop: 2, marginBottom: 6 },
  loanRow: { flexDirection: "row", gap: 12 },
  loanResult: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  loanResLabel: { fontSize: 10, color: colors.muted },
  loanResValue: { fontSize: 18, fontWeight: "800", color: colors.brand, marginTop: 2 },
  loanResTotal: { fontSize: 14, fontWeight: "700", color: colors.onSurface, marginTop: 2 },
});
