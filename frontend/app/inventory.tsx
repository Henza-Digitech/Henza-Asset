import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  TextInput,
  ScrollView,
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

function todayStr() {
  const d = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtQty(n: number) {
  return Number(n || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

function fmtDate(s?: string | null) {
  if (!s) return "-";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

type FormState = {
  name: string;
  quantity: string;
  unit: string;
  price: string;
  entry_date: string;
  exit_date: string;
  notes: string;
};

const EMPTY: FormState = {
  name: "",
  quantity: "",
  unit: "pcs",
  price: "",
  entry_date: todayStr(),
  exit_date: "",
  notes: "",
};

export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { isWide } = useResponsive();

  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const items = useQuery({
    queryKey: ["inventory", q],
    queryFn: () => api.listInventory(q || undefined),
  });
  const stats = useQuery({
    queryKey: ["inventory-stats"],
    queryFn: () => api.inventoryStats(),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["inventory"] });
    qc.invalidateQueries({ queryKey: ["inventory-stats"] });
  };

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        quantity: parseFloat(form.quantity.replace(/\./g, "").replace(",", ".")) || 0,
        unit: form.unit.trim() || "pcs",
        price: parseFloat(form.price.replace(/\./g, "")) || 0,
        entry_date: form.entry_date.trim() || todayStr(),
        exit_date: form.exit_date.trim() || null,
        notes: form.notes.trim(),
      };
      return editing
        ? api.updateInventory(editing.id, payload)
        : api.createInventory(payload);
    },
    onSuccess: () => {
      invalidate();
      close();
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => api.deleteInventory(id),
    onSuccess: () => {
      invalidate();
      close();
    },
  });

  function open(it: any = null) {
    if (it) {
      setEditing(it);
      setForm({
        name: it.name || "",
        quantity: String(it.quantity ?? ""),
        unit: it.unit || "pcs",
        price: it.price
          ? String(it.price).replace(/\B(?=(\d{3})+(?!\d))/g, ".")
          : "",
        entry_date: (it.entry_date || "").slice(0, 10) || todayStr(),
        exit_date: (it.exit_date || "").slice(0, 10),
        notes: it.notes || "",
      });
    } else {
      setEditing(null);
      setForm(EMPTY);
    }
    setShowForm(true);
  }

  function close() {
    setShowForm(false);
    setEditing(null);
  }

  function confirmDelete() {
    if (!editing) return;
    if (Platform.OS === "web") {
      if (window.confirm(`Hapus item "${editing.name}"?`)) del.mutate(editing.id);
      return;
    }
    Alert.alert("Hapus", `Hapus item "${editing.name}"?`, [
      { text: "Batal", style: "cancel" },
      { text: "Hapus", style: "destructive", onPress: () => del.mutate(editing.id) },
    ]);
  }

  const st = stats.data || {
    total_items: 0,
    total_qty: 0,
    in_stock_items: 0,
    in_stock_qty: 0,
    out_items: 0,
    out_qty: 0,
    in_stock_value: 0,
    total_value: 0,
  };

  return (
    <View style={styles.container}>
      {/* Sticky header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={10} testID="inventory-back-btn">
            <Feather name="arrow-left" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Rekap Stok</Text>
          <Pressable style={styles.addBtn} onPress={() => open()} testID="add-inventory-btn">
            <Feather name="plus" size={18} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.searchBox}>
          <Feather name="search" size={16} color={colors.muted} />
          <TextInput
            placeholder="Cari nama barang..."
            value={q}
            onChangeText={setQ}
            style={styles.searchInput}
            placeholderTextColor={colors.muted}
            testID="inventory-search-input"
          />
        </View>
      </View>

      <FlatList
        data={items.data || []}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
          width: "100%",
          maxWidth: isWide ? 900 : undefined,
          alignSelf: "center",
        }}
        ListHeaderComponent={
          <View>
            {/* Nilai persediaan */}
            <View style={styles.valueCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.valueLabel}>Nilai Persediaan · di gudang</Text>
                <Text style={styles.valueAmount} testID="inventory-value">
                  {formatIDR(st.in_stock_value || 0)}
                </Text>
                {(st.total_value || 0) !== (st.in_stock_value || 0) && (
                  <Text style={styles.valueSub}>
                    Total tercatat: {formatIDR(st.total_value || 0)}
                  </Text>
                )}
              </View>
              <View style={styles.valueIcon}>
                <Feather name="dollar-sign" size={22} color={colors.brand} />
              </View>
            </View>

            {/* Key statistics */}
            <View style={styles.statGrid}>
              <StatCard
                icon="layers"
                label="Total Item"
                value={String(st.total_items)}
                color={colors.brand}
              />
              <StatCard
                icon="hash"
                label="Total Kuantitas"
                value={fmtQty(st.total_qty)}
                color={colors.brandPrimary}
              />
              <StatCard
                icon="arrow-down-circle"
                label="Masih di Gudang"
                value={fmtQty(st.in_stock_qty)}
                sub={`${st.in_stock_items} item`}
                color={colors.success}
              />
              <StatCard
                icon="arrow-up-circle"
                label="Sudah Keluar"
                value={fmtQty(st.out_qty)}
                sub={`${st.out_items} item`}
                color={colors.error}
              />
            </View>

            {/* Table header */}
            <View style={styles.tableHead}>
              <Text style={[styles.th, { flex: 2.2 }]}>Nama</Text>
              <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Qty</Text>
              <Text style={[styles.th, { flex: 1.3, textAlign: "center" }]}>Masuk</Text>
              <Text style={[styles.th, { flex: 1.3, textAlign: "center" }]}>Keluar</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            Belum ada data stok. Ketuk + untuk menambah barang masuk.
          </Text>
        }
        renderItem={({ item, index }) => {
          const out = !!item.exit_date;
          return (
            <Pressable
              style={[
                styles.row,
                { backgroundColor: index % 2 === 0 ? colors.surface : colors.surfaceSecondary },
              ]}
              onPress={() => open(item)}
              testID={`inventory-row-${item.id}`}
            >
              <View style={{ flex: 2.2 }}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.name}
                </Text>
                <View style={[styles.statusPill, out ? styles.pillOut : styles.pillIn]}>
                  <Text style={[styles.statusText, { color: out ? colors.error : colors.success }]}>
                    {out ? "Keluar" : "Di gudang"}
                  </Text>
                </View>
                {item.price > 0 && (
                  <Text style={styles.priceLine} numberOfLines={1}>
                    {formatIDR(item.price)}/{item.unit} · {formatIDR(item.price * item.quantity)}
                  </Text>
                )}
              </View>
              <Text style={[styles.cell, { flex: 1, textAlign: "right", fontWeight: "700" }]}>
                {fmtQty(item.quantity)}
                <Text style={styles.unit}> {item.unit}</Text>
              </Text>
              <Text style={[styles.cellDate, { flex: 1.3, textAlign: "center" }]}>
                {fmtDate(item.entry_date)}
              </Text>
              <Text style={[styles.cellDate, { flex: 1.3, textAlign: "center" }]}>
                {fmtDate(item.exit_date)}
              </Text>
            </Pressable>
          );
        }}
      />

      {/* Add / edit modal */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={close}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{editing ? "Edit Barang" : "Tambah Barang"}</Text>
              <Pressable onPress={close} hitSlop={10}>
                <Feather name="x" size={22} color={colors.onSurface} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Nama Barang</Text>
              <TextInput
                placeholder="mis. Beras 5kg"
                value={form.name}
                onChangeText={(v) => setForm({ ...form, name: v })}
                style={styles.input}
                placeholderTextColor={colors.muted}
                testID="inventory-name-input"
              />

              <View style={styles.rowGap}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Kuantitas</Text>
                  <TextInput
                    placeholder="0"
                    value={form.quantity}
                    onChangeText={(v) => setForm({ ...form, quantity: v.replace(/[^0-9.,]/g, "") })}
                    keyboardType="numeric"
                    style={styles.input}
                    placeholderTextColor={colors.muted}
                    testID="inventory-qty-input"
                  />
                </View>
                <View style={{ width: 110 }}>
                  <Text style={styles.label}>Satuan</Text>
                  <TextInput
                    placeholder="pcs"
                    value={form.unit}
                    onChangeText={(v) => setForm({ ...form, unit: v })}
                    style={styles.input}
                    placeholderTextColor={colors.muted}
                    testID="inventory-unit-input"
                  />
                </View>
              </View>

              <Text style={styles.label}>Harga per Unit (Rp)</Text>
              <TextInput
                placeholder="0"
                value={form.price}
                onChangeText={(v) =>
                  setForm({
                    ...form,
                    price: v.replace(/[^0-9]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, "."),
                  })
                }
                keyboardType="number-pad"
                style={styles.input}
                placeholderTextColor={colors.muted}
                testID="inventory-price-input"
              />

              <Text style={styles.label}>Tanggal Masuk (YYYY-MM-DD)</Text>
              <View style={styles.dateRow}>
                <TextInput
                  placeholder="2026-01-31"
                  value={form.entry_date}
                  onChangeText={(v) => setForm({ ...form, entry_date: v })}
                  style={[styles.input, { flex: 1 }]}
                  placeholderTextColor={colors.muted}
                  testID="inventory-entry-input"
                />
                <Pressable
                  style={styles.todayBtn}
                  onPress={() => setForm({ ...form, entry_date: todayStr() })}
                >
                  <Text style={styles.todayText}>Hari ini</Text>
                </Pressable>
              </View>

              <Text style={styles.label}>Tanggal Keluar (opsional)</Text>
              <View style={styles.dateRow}>
                <TextInput
                  placeholder="Kosongkan jika masih di gudang"
                  value={form.exit_date}
                  onChangeText={(v) => setForm({ ...form, exit_date: v })}
                  style={[styles.input, { flex: 1 }]}
                  placeholderTextColor={colors.muted}
                  testID="inventory-exit-input"
                />
                {form.exit_date ? (
                  <Pressable
                    style={styles.todayBtn}
                    onPress={() => setForm({ ...form, exit_date: "" })}
                  >
                    <Text style={styles.todayText}>Hapus</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={styles.todayBtn}
                    onPress={() => setForm({ ...form, exit_date: todayStr() })}
                  >
                    <Text style={styles.todayText}>Hari ini</Text>
                  </Pressable>
                )}
              </View>

              <Text style={styles.label}>Catatan (opsional)</Text>
              <TextInput
                placeholder="Catatan tambahan"
                value={form.notes}
                onChangeText={(v) => setForm({ ...form, notes: v })}
                style={styles.input}
                placeholderTextColor={colors.muted}
              />

              <Pressable
                style={[styles.saveBtn, !form.name && { opacity: 0.5 }]}
                disabled={!form.name || save.isPending}
                onPress={() => save.mutate()}
                testID="save-inventory-btn"
              >
                <Text style={styles.saveText}>{save.isPending ? "Menyimpan..." : "Simpan"}</Text>
              </Pressable>

              {editing && (
                <Pressable
                  style={styles.deleteBtn}
                  onPress={confirmDelete}
                  testID="delete-inventory-btn"
                >
                  <Feather name="trash-2" size={16} color={colors.error} />
                  <Text style={styles.deleteText}>Hapus Barang</Text>
                </Pressable>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: `${color}18` }]}>
        <Feather name={icon as any} size={16} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {!!sub && <Text style={styles.statSub}>{sub}</Text>}
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
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: 13 },

  valueCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.brandTertiary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  valueLabel: { fontSize: 12, fontWeight: "600", color: colors.brand },
  valueAmount: { fontSize: 24, fontWeight: "800", color: colors.brand, marginTop: 4 },
  valueSub: { fontSize: 11, color: colors.onBrandTertiary, marginTop: 4 },
  valueIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  priceLine: { fontSize: 10, color: colors.muted, marginTop: 3, fontWeight: "600" },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  statCard: {
    width: "47.5%",
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statValue: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  statLabel: { fontSize: 11, color: colors.muted, marginTop: 2 },
  statSub: { fontSize: 10, color: colors.muted, marginTop: 1, fontWeight: "600" },

  tableHead: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceSecondary,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  th: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  itemName: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  statusPill: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  pillIn: { backgroundColor: `${colors.success}18` },
  pillOut: { backgroundColor: `${colors.error}18` },
  statusText: { fontSize: 9, fontWeight: "700" },
  cell: { fontSize: 12, color: colors.onSurface },
  unit: { fontSize: 10, color: colors.muted, fontWeight: "500" },
  cellDate: { fontSize: 11, color: colors.muted },
  empty: { textAlign: "center", color: colors.muted, padding: 30, fontSize: 12 },

  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "88%",
  },
  sheetHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.onSurfaceSecondary,
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    color: colors.onSurface,
    fontSize: 14,
  },
  rowGap: { flexDirection: "row", gap: 12 },
  dateRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  todayBtn: {
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  todayText: { fontSize: 12, fontWeight: "700", color: colors.brand },
  saveBtn: {
    height: 50,
    backgroundColor: colors.brand,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  saveText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  deleteBtn: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 10,
  },
  deleteText: { color: colors.error, fontWeight: "700", fontSize: 13 },
});
