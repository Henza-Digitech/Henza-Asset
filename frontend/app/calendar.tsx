import { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Feather from "@react-native-vector-icons/feather";
import { useRouter } from "expo-router";

import { api, formatIDR, shortIDR } from "@/src/api";
import { colors } from "@/src/theme";
import { categoryMeta } from "@/src/categories";
import { CategoryIcon } from "@/src/components/CategoryIcon";

type Scope = "all" | "personal" | "business";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const WEEKDAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const today = new Date();
  const [scope, setScope] = useState<Scope>("all");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-12
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // All transactions for the current scope (used for both grid totals & day details)
  const { data: txs = [] } = useQuery({
    queryKey: ["calendar-tx", scope],
    queryFn: () =>
      api.listTransactions({
        ...(scope !== "all" ? { scope } : {}),
        sort: "date_desc",
        limit: "5000",
      }),
  });

  const monthPrefix = `${year}-${pad(month)}`;

  // Group transactions by date-key (YYYY-MM-DD)
  const byDate = useMemo(() => {
    const map: Record<string, { income: number; expense: number; items: any[] }> = {};
    for (const t of txs) {
      const raw: string = t.date || t.created_at || "";
      const key = raw.slice(0, 10);
      if (!key.startsWith(monthPrefix)) continue;
      const d = (map[key] = map[key] || { income: 0, expense: 0, items: [] });
      if (t.type === "income") d.income += t.amount;
      else d.expense += t.amount;
      d.items.push(t);
    }
    return map;
  }, [txs, monthPrefix]);

  const monthTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    Object.values(byDate).forEach((d) => {
      income += d.income;
      expense += d.expense;
    });
    return { income, expense, net: income - expense };
  }, [byDate]);

  // Build calendar cells (leading blanks + days of month)
  const cells = useMemo(() => {
    const firstWeekday = new Date(year, month - 1, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month, 0).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [year, month]);

  const cellSize = (Math.min(width, 900) - 32) / 7;
  const isWide = width >= 900;

  function shiftMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setMonth(m);
    setYear(y);
    setSelectedDay(null);
  }

  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(
    today.getDate()
  )}`;

  const selectedData = selectedDay ? byDate[selectedDay] : null;

  return (
    <View style={styles.container}>
      {/* Sticky header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={10} testID="calendar-back-btn">
            <Feather name="arrow-left" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Kalender Keuangan</Text>
          <View style={{ width: 22 }} />
        </View>

        {/* Month navigation */}
        <View style={styles.monthNav}>
          <Pressable
            style={styles.navBtn}
            onPress={() => shiftMonth(-1)}
            hitSlop={8}
            testID="calendar-prev-month"
          >
            <Feather name="chevron-left" size={20} color={colors.brand} />
          </Pressable>
          <Text style={styles.monthLabel} testID="calendar-month-label">
            {MONTHS[month - 1]} {year}
          </Text>
          <Pressable
            style={styles.navBtn}
            onPress={() => shiftMonth(1)}
            hitSlop={8}
            testID="calendar-next-month"
          >
            <Feather name="chevron-right" size={20} color={colors.brand} />
          </Pressable>
        </View>

        {/* Scope toggle */}
        <View style={styles.toggleRow}>
          {(["all", "personal", "business"] as const).map((s) => (
            <Pressable
              key={s}
              style={[styles.toggle, scope === s && styles.toggleActive]}
              onPress={() => setScope(s)}
              testID={`calendar-scope-${s}`}
            >
              <Text style={[styles.toggleText, scope === s && styles.toggleTextActive]}>
                {s === "all" ? "Semua" : s === "personal" ? "Pribadi" : "Perusahaan"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, width: "100%", maxWidth: isWide ? 820 : undefined, alignSelf: "center" }}>
        {/* Month totals */}
        <View style={styles.totalsCard}>
          <View style={styles.totalCol}>
            <Text style={styles.totalLabel}>Pemasukan</Text>
            <Text style={[styles.totalVal, { color: colors.success }]} testID="calendar-total-income">
              {formatIDR(monthTotals.income)}
            </Text>
          </View>
          <View style={styles.totalDivider} />
          <View style={styles.totalCol}>
            <Text style={styles.totalLabel}>Pengeluaran</Text>
            <Text style={[styles.totalVal, { color: colors.error }]} testID="calendar-total-expense">
              {formatIDR(monthTotals.expense)}
            </Text>
          </View>
          <View style={styles.totalDivider} />
          <View style={styles.totalCol}>
            <Text style={styles.totalLabel}>Selisih</Text>
            <Text
              style={[
                styles.totalVal,
                { color: monthTotals.net >= 0 ? colors.brand : colors.error },
              ]}
            >
              {formatIDR(monthTotals.net)}
            </Text>
          </View>
        </View>

        {/* Weekday header */}
        <View style={styles.weekRow}>
          {WEEKDAYS.map((w, i) => (
            <Text
              key={w}
              style={[
                styles.weekday,
                { width: cellSize },
                (i === 0 || i === 6) && { color: colors.error },
              ]}
            >
              {w}
            </Text>
          ))}
        </View>

        {/* Grid */}
        <View style={styles.grid}>
          {cells.map((day, idx) => {
            if (day === null) {
              return <View key={`blank-${idx}`} style={{ width: cellSize, height: cellSize + 18 }} />;
            }
            const key = `${monthPrefix}-${pad(day)}`;
            const d = byDate[key];
            const isToday = key === todayKey;
            const isSelected = key === selectedDay;
            return (
              <Pressable
                key={key}
                style={[
                  styles.cell,
                  { width: cellSize, height: cellSize + 18 },
                  isSelected && styles.cellSelected,
                ]}
                onPress={() => setSelectedDay(isSelected ? null : key)}
                testID={`calendar-day-${day}`}
              >
                <View
                  style={[
                    styles.dayNumWrap,
                    isToday && styles.dayNumToday,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNum,
                      isToday && styles.dayNumTodayText,
                    ]}
                  >
                    {day}
                  </Text>
                </View>
                {d?.income > 0 && (
                  <Text style={[styles.cellAmt, { color: colors.success }]} numberOfLines={1}>
                    {shortIDR(d.income).replace("Rp ", "")}
                  </Text>
                )}
                {d?.expense > 0 && (
                  <Text style={[styles.cellAmt, { color: colors.error }]} numberOfLines={1}>
                    {shortIDR(d.expense).replace("Rp ", "")}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: colors.success }]} />
            <Text style={styles.legendText}>Pemasukan</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: colors.error }]} />
            <Text style={styles.legendText}>Pengeluaran</Text>
          </View>
          <Text style={styles.legendHint}>Ketuk tanggal untuk rincian</Text>
        </View>
      </ScrollView>

      {/* Day detail sheet */}
      <Modal
        visible={!!selectedDay}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedDay(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setSelectedDay(null)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>
                {selectedDay
                  ? `${Number(selectedDay.slice(8, 10))} ${MONTHS[month - 1]} ${year}`
                  : ""}
              </Text>
              <Pressable onPress={() => setSelectedDay(null)} hitSlop={10}>
                <Feather name="x" size={22} color={colors.onSurface} />
              </Pressable>
            </View>

            {selectedData ? (
              <>
                <View style={styles.daySummary}>
                  <View style={styles.daySummaryCol}>
                    <Text style={styles.daySumLabel}>Masuk</Text>
                    <Text style={[styles.daySumVal, { color: colors.success }]}>
                      {formatIDR(selectedData.income)}
                    </Text>
                  </View>
                  <View style={styles.daySummaryCol}>
                    <Text style={styles.daySumLabel}>Keluar</Text>
                    <Text style={[styles.daySumVal, { color: colors.error }]}>
                      {formatIDR(selectedData.expense)}
                    </Text>
                  </View>
                </View>
                <ScrollView style={{ maxHeight: 320 }}>
                  {selectedData.items.map((t: any) => {
                    const meta = categoryMeta(t.category);
                    return (
                      <View key={t.id} style={styles.txRow} testID={`calendar-tx-${t.id}`}>
                        <CategoryIcon name={meta.icon} color={meta.color} size={16} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.txDesc} numberOfLines={1}>
                            {t.description || meta.label}
                          </Text>
                          <Text style={styles.txMeta}>
                            {meta.label} • {t.scope === "business" ? "Perusahaan" : "Pribadi"}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.txAmt,
                            { color: t.type === "income" ? colors.success : colors.error },
                          ]}
                        >
                          {t.type === "income" ? "+" : "-"}
                          {formatIDR(t.amount).replace("Rp ", "")}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </>
            ) : (
              <Text style={styles.empty}>Tidak ada transaksi pada tanggal ini.</Text>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "700", color: colors.onSurface },

  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: { fontSize: 16, fontWeight: "700", color: colors.onSurface },

  toggleRow: {
    flexDirection: "row",
    backgroundColor: colors.surfaceTertiary,
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  toggle: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleActive: { backgroundColor: colors.brand },
  toggleText: { fontSize: 12, fontWeight: "600", color: colors.onSurfaceSecondary },
  toggleTextActive: { color: "#fff" },

  totalsCard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    marginBottom: 16,
    alignItems: "center",
  },
  totalCol: { flex: 1, alignItems: "center" },
  totalDivider: { width: 1, height: 32, backgroundColor: colors.border },
  totalLabel: { fontSize: 10, color: colors.muted, marginBottom: 4 },
  totalVal: { fontSize: 13, fontWeight: "700" },

  weekRow: { flexDirection: "row", marginBottom: 6 },
  weekday: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    alignItems: "center",
    paddingTop: 4,
    borderRadius: 8,
  },
  cellSelected: {
    backgroundColor: colors.brandTertiary,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  dayNumWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  dayNumToday: { backgroundColor: colors.brand },
  dayNum: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  dayNumTodayText: { color: "#fff" },
  cellAmt: { fontSize: 8.5, fontWeight: "700" },

  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 16,
    flexWrap: "wrap",
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: colors.muted },
  legendHint: { fontSize: 11, color: colors.muted, marginLeft: "auto", fontStyle: "italic" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  sheetHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  daySummary: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  daySummaryCol: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    padding: 12,
  },
  daySumLabel: { fontSize: 11, color: colors.muted },
  daySumVal: { fontSize: 15, fontWeight: "700", marginTop: 4 },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  txDesc: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  txMeta: { fontSize: 10, color: colors.muted, marginTop: 1 },
  txAmt: { fontSize: 13, fontWeight: "700" },
  empty: { textAlign: "center", color: colors.muted, paddingVertical: 30, fontSize: 12 },
});
