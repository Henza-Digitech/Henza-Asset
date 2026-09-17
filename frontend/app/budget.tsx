import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Feather from "@react-native-vector-icons/feather";
import { useRouter } from "expo-router";

import { api, formatIDR } from "@/src/api";
import { colors } from "@/src/theme";
import { useResponsive } from "@/src/responsive";
import { EXPENSE_CATEGORIES, categoryMeta } from "@/src/categories";
import { CategoryIcon } from "@/src/components/CategoryIcon";

type Scope = "personal" | "business";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function formatThousands(v: string) {
  return v.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export default function BudgetScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { isWide } = useResponsive();

  const now = new Date();
  const [scope, setScope] = useState<Scope>("personal");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ category: "konsumsi", amount: "" });

  const overview = useQuery({
    queryKey: ["budget-overview", scope],
    queryFn: () => api.budgetOverview(scope),
  });

  const data = overview.data || {
    budgets: [],
    total_budget: 0,
    total_spent: 0,
    income: 0,
    remaining: 0,
  };

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        category: form.category,
        amount: parseFloat(form.amount.replace(/\./g, "")) || 0,
        scope,
        notes: "",
      };
      return editing
        ? api.updateBudget(editing.id, payload)
        : api.createBudget(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget-overview"] });
      close();
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => api.deleteBudget(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budget-overview"] }),
  });

  function confirmDelete(id: string, label: string) {
    if (Platform.OS === "web") {
      if (window.confirm(`Hapus anggaran ${label}?`)) del.mutate(id);
      return;
    }
    Alert.alert("Hapus", `Hapus anggaran ${label}?`, [
      { text: "Batal", style: "cancel" },
      { text: "Hapus", style: "destructive", onPress: () => del.mutate(id) },
    ]);
  }

  function open(b: any = null) {
    if (b) {
      setEditing(b);
      setForm({
        category: b.category,
        amount: formatThousands(String(b.amount)),
      });
    } else {
      setEditing(null);
      setForm({ category: "konsumsi", amount: "" });
    }
    setShowForm(true);
  }

  function close() {
    setShowForm(false);
    setEditing(null);
  }

  const remaining = data.remaining;
  const overBudget = remaining < 0;

  return (
    <View style={styles.container}>
      {/* Sticky header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={10} testID="budget-back-btn">
            <Feather name="arrow-left" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Anggaran</Text>
          <Pressable style={styles.addBtn} onPress={() => open()} testID="add-budget-btn">
            <Feather name="plus" size={18} color="#fff" />
          </Pressable>
        </View>
        <Text style={styles.sub}>
          {MONTHS[now.getMonth()]} {now.getFullYear()}
        </Text>

        {/* Scope toggle */}
        <View style={styles.toggleRow}>
          {(["personal", "business"] as const).map((s) => (
            <Pressable
              key={s}
              style={[styles.toggle, scope === s && styles.toggleActive]}
              onPress={() => setScope(s)}
              testID={`budget-scope-${s}`}
            >
              <Text style={[styles.toggleText, scope === s && styles.toggleTextActive]}>
                {s === "personal" ? "Pribadi" : "Perusahaan"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, width: "100%", maxWidth: isWide ? 820 : undefined, alignSelf: "center" }}>
        {/* Summary card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Pemasukan</Text>
              <Text style={[styles.summaryVal, { color: colors.success }]} testID="budget-income">
                {formatIDR(data.income)}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Anggaran</Text>
              <Text style={[styles.summaryVal, { color: colors.brand }]} testID="budget-total">
                {formatIDR(data.total_budget)}
              </Text>
            </View>
          </View>

          <View style={styles.remainingBox}>
            <View>
              <Text style={styles.remainingLabel}>Sisa Saldo</Text>
              <Text style={styles.remainingHint}>Pemasukan − Anggaran</Text>
            </View>
            <Text
              style={[
                styles.remainingVal,
                { color: overBudget ? colors.error : colors.success },
              ]}
              testID="budget-remaining"
            >
              {formatIDR(remaining)}
            </Text>
          </View>

          {overBudget && (
            <View style={styles.warnBox}>
              <Feather name="alert-triangle" size={13} color={colors.error} />
              <Text style={styles.warnText}>
                Anggaran melebihi pemasukan bulan ini.
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>Rencana per Kategori</Text>

        {data.budgets.length === 0 ? (
          <View style={styles.emptyBox}>
            <Feather name="pie-chart" size={28} color={colors.muted} />
            <Text style={styles.empty}>
              Belum ada anggaran. Ketuk + untuk menambah rencana anggaran per kategori.
            </Text>
          </View>
        ) : (
          data.budgets.map((b: any) => {
            const meta = categoryMeta(b.category);
            const pct = b.amount > 0 ? Math.min(b.spent / b.amount, 1) : 0;
            const over = b.spent > b.amount;
            return (
              <Pressable
                key={b.id}
                style={styles.card}
                onPress={() => open(b)}
                testID={`budget-card-${b.id}`}
              >
                <View style={styles.cardTop}>
                  <View style={styles.cardIcon}>
                    <CategoryIcon name={meta.icon} color={meta.color} size={16} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{meta.label}</Text>
                    <Text style={styles.cardMeta}>
                      Terpakai {formatIDR(b.spent)} dari {formatIDR(b.amount)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => confirmDelete(b.id, meta.label)}
                    hitSlop={10}
                    testID={`delete-budget-${b.id}`}
                  >
                    <Feather name="trash-2" size={15} color={colors.error} />
                  </Pressable>
                </View>

                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      {
                        width: `${pct * 100}%`,
                        backgroundColor: over ? colors.error : colors.brandPrimary,
                      },
                    ]}
                  />
                </View>

                <View style={styles.cardBottom}>
                  <Text style={[styles.remainCat, over && { color: colors.error }]}>
                    {over
                      ? `Lebih ${formatIDR(Math.abs(b.remaining))}`
                      : `Sisa ${formatIDR(b.remaining)}`}
                  </Text>
                  <Text style={styles.pctText}>{Math.round(pct * 100)}%</Text>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* Add / edit modal */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={close}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>
                {editing ? "Edit Anggaran" : "Tambah Anggaran"}
              </Text>
              <Pressable onPress={close} hitSlop={10}>
                <Feather name="x" size={22} color={colors.onSurface} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.fieldLabel}>Kategori</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.catRow}
              >
                {EXPENSE_CATEGORIES.map((c) => {
                  const active = form.category === c.key;
                  return (
                    <Pressable
                      key={c.key}
                      style={[styles.catChip, active && styles.catChipActive]}
                      onPress={() => setForm({ ...form, category: c.key })}
                      testID={`budget-cat-${c.key}`}
                    >
                      <CategoryIcon name={c.icon} color={active ? "#fff" : c.color} size={14} />
                      <Text style={[styles.catChipText, active && { color: "#fff" }]}>
                        {c.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.fieldLabel}>Jumlah Anggaran (Rp)</Text>
              <TextInput
                placeholder="0"
                value={form.amount}
                onChangeText={(v) => {
                  const clean = v.replace(/[^0-9]/g, "");
                  setForm({ ...form, amount: formatThousands(clean) });
                }}
                keyboardType="number-pad"
                style={styles.input}
                placeholderTextColor={colors.muted}
                testID="budget-amount-input"
              />

              <Pressable
                style={[styles.saveBtn, !form.amount && { opacity: 0.5 }]}
                disabled={!form.amount || save.isPending}
                onPress={() => save.mutate()}
                testID="save-budget-btn"
              >
                <Text style={styles.saveText}>{save.isPending ? "Menyimpan..." : "Simpan"}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
    marginBottom: 4,
  },
  title: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
  sub: { fontSize: 12, color: colors.muted, marginBottom: 12 },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
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

  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 20,
  },
  summaryTop: { flexDirection: "row", gap: 12, marginBottom: 14 },
  summaryItem: { flex: 1 },
  summaryLabel: { fontSize: 11, color: colors.muted },
  summaryVal: { fontSize: 15, fontWeight: "700", marginTop: 4 },
  remainingBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    padding: 14,
  },
  remainingLabel: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  remainingHint: { fontSize: 10, color: colors.muted, marginTop: 2 },
  remainingVal: { fontSize: 20, fontWeight: "800" },
  warnBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    backgroundColor: `${colors.error}15`,
    padding: 10,
    borderRadius: 10,
  },
  warnText: { fontSize: 11, color: colors.error, flex: 1 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.onSurface,
    marginBottom: 12,
  },

  emptyBox: { alignItems: "center", paddingVertical: 40, gap: 12 },
  empty: {
    textAlign: "center",
    color: colors.muted,
    fontSize: 12,
    paddingHorizontal: 24,
    lineHeight: 18,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
  cardMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceTertiary,
    overflow: "hidden",
  },
  fill: { height: 8, borderRadius: 4 },
  cardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  remainCat: { fontSize: 12, fontWeight: "600", color: colors.success },
  pctText: { fontSize: 11, color: colors.muted, fontWeight: "600" },

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
  sheetTitle: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.onSurfaceSecondary,
    marginBottom: 8,
    marginTop: 4,
  },
  catRow: { gap: 8, paddingBottom: 4 },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexShrink: 0,
  },
  catChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  catChipText: { fontSize: 12, color: colors.onSurfaceSecondary, fontWeight: "500" },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    color: colors.onSurface,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
    marginBottom: 4,
  },
  saveBtn: {
    height: 50,
    backgroundColor: colors.brand,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  saveText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
