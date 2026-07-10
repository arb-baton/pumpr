import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, shadow, spacing } from "./theme";
import { spark } from "./mockData";

export function Screen({ children, padded = true }) {
  return <View style={[styles.screen, padded && styles.screenPad]}>{children}</View>;
}

export function Pill({ children, active, icon, style }) {
  return (
    <View style={[styles.pill, active && styles.pillActive, style]}>
      {icon ? <Ionicons name={icon} size={14} color={active ? colors.black : colors.text} /> : null}
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{children}</Text>
    </View>
  );
}

export function IconButton({ name, onPress, active, size = 46 }) {
  return (
    <Pressable onPress={onPress} style={[styles.iconButton, { width: size, height: size, borderRadius: size / 2 }, active && styles.iconButtonActive]}>
      <Ionicons name={name} size={22} color={active ? colors.black : colors.text} />
    </Pressable>
  );
}

export function SectionTitle({ title, accent, right }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionText}>
        {title} {accent ? <Text style={styles.sectionAccent}>{accent}</Text> : null}
      </Text>
      {right}
    </View>
  );
}

export function MiniSparkline({ data = spark(1), height = 74, positive = true }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  return (
    <View style={[styles.sparkWrap, { height }]}>
      {data.map((value, index) => {
        const normalized = (value - min) / Math.max(1, max - min);
        return (
          <View
            key={`${value}-${index}`}
            style={[
              styles.sparkBar,
              {
                height: 6 + normalized * (height - 12),
                backgroundColor: positive ? colors.green : colors.red,
                opacity: 0.35 + normalized * 0.6
              }
            ]}
          />
        );
      })}
    </View>
  );
}

export function CalledCard({ coin, index = 0, onPress }) {
  return (
    <Pressable style={styles.calledCard} onPress={onPress}>
      <View style={styles.calledHeader}>
        <Image source={{ uri: coin.image }} style={styles.calledImage} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={styles.calledName}>{coin.name}</Text>
          <Text style={styles.muted}>{coin.symbol}</Text>
        </View>
      </View>
      <MiniSparkline data={spark(index + 2)} />
      <Text style={styles.cardMoney}>{coin.mc}</Text>
      <Text style={styles.greenText}>↑ {coin.change.replace("+", "")}</Text>
    </Pressable>
  );
}

export function CoinRow({ coin, onPress }) {
  return (
    <Pressable style={styles.coinRow} onPress={onPress}>
      <Image source={{ uri: coin.image }} style={styles.rowImage} />
      <View style={styles.coinMain}>
        <Text style={styles.coinName}><Text style={styles.mutedSmall}>{coin.symbol}</Text>  {coin.name}</Text>
        <Text style={styles.rowDesc} numberOfLines={2}>{coin.description}</Text>
        <View style={styles.rowSignals}>
          <Text style={styles.greenTiny}>☘ {coin.age}</Text>
          <Text style={styles.greenTiny}>👥 {coin.holders || 0}</Text>
          <Text style={styles.redTiny}>× 18%</Text>
        </View>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.mcText}>MC {coin.mc}</Text>
        <Text style={styles.multiple}>{coin.multiple}</Text>
        <Text style={styles.mutedSmall}>TX 6.8K</Text>
      </View>
    </Pressable>
  );
}

export function CallerCard({ caller, featured = false }) {
  return (
    <View style={[styles.callerCard, featured && styles.callerFeatured]}>
      <View style={styles.callerTop}>
        <Text style={styles.rank}>{featured ? "🔥 RANK 01" : caller.rank}</Text>
        <Text style={styles.calls}>{caller.calls} CALLS</Text>
      </View>
      <View style={styles.callerIdentity}>
        <Image source={{ uri: caller.avatar }} style={featured ? styles.callerAvatarBig : styles.callerAvatar} />
        <View>
          <Text style={featured ? styles.callerNameBig : styles.callerName}>{caller.name}</Text>
          <Text style={styles.muted}>{caller.handle}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <IconButton name="notifications-outline" size={44} />
      </View>
      {featured ? (
        <>
          <Text style={styles.bestLabel}>BEST MULTIPLE</Text>
          <Text style={styles.bestMultiple}>{caller.best}</Text>
        </>
      ) : null}
      <View style={styles.statsGrid}>
        <Metric label="MEDIAN" value={caller.median} />
        <Metric label="2X+" value={caller.twoX} />
        <Metric label="1.5X+" value={caller.oneFiveX} />
        <Metric label={featured ? "TTP" : "CALLOUTS"} value={featured ? caller.ttp : caller.calls} />
      </View>
    </View>
  );
}

export function Metric({ label, value }) {
  return (
    <View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export function BottomNav({ active, onSelect, onCreate }) {
  const tabs = [
    ["home", "capsule-outline"],
    ["markets", "ellipse-outline"],
    ["communities", "megaphone-outline"],
    ["wallet", "wallet-outline"]
  ];
  return (
    <View style={styles.navWrap}>
      <View style={styles.navBar}>
        {tabs.map(([key, icon]) => (
          <Pressable key={key} style={styles.navItem} onPress={() => onSelect(key)}>
            <Ionicons name={icon} size={28} color={active === key ? colors.text : colors.muted} />
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.createFab} onPress={onCreate}>
        <Ionicons name="add" size={32} color={colors.black} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenPad: { paddingHorizontal: spacing.lg },
  sectionTitle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.lg, marginBottom: spacing.md },
  sectionText: { color: colors.text, fontSize: 29, fontWeight: "800", letterSpacing: -0.2 },
  sectionAccent: { color: colors.green, fontStyle: "italic" },
  muted: { color: colors.muted, fontSize: 14 },
  mutedSmall: { color: colors.muted, fontSize: 12 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: radii.pill },
  pillActive: { backgroundColor: colors.green, borderColor: colors.green },
  pillText: { color: colors.text, fontWeight: "800", fontSize: 13 },
  pillTextActive: { color: colors.black },
  iconButton: { alignItems: "center", justifyContent: "center", backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1 },
  iconButtonActive: { backgroundColor: colors.green, borderColor: colors.green },
  calledCard: { width: 216, padding: 16, borderRadius: radii.lg, backgroundColor: colors.panel, marginRight: 12, borderWidth: 1, borderColor: colors.border },
  calledHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  calledImage: { width: 58, height: 58, borderRadius: 16, backgroundColor: colors.panel2 },
  calledName: { color: colors.text, fontSize: 20, fontWeight: "800" },
  sparkWrap: { flexDirection: "row", alignItems: "flex-end", gap: 2, paddingTop: 12, paddingBottom: 8 },
  sparkBar: { flex: 1, borderRadius: 4 },
  cardMoney: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 4 },
  greenText: { color: colors.green, fontSize: 17, fontWeight: "700" },
  coinRow: { flexDirection: "row", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.border },
  rowImage: { width: 82, height: 82, borderRadius: 14, borderWidth: 2, borderColor: colors.green },
  coinMain: { flex: 1 },
  coinName: { color: colors.text, fontSize: 16, fontWeight: "800" },
  rowDesc: { color: colors.text, fontSize: 14, lineHeight: 19, marginTop: 8 },
  rowSignals: { flexDirection: "row", gap: 12, marginTop: 8 },
  greenTiny: { color: colors.green, fontSize: 12, fontWeight: "700" },
  redTiny: { color: colors.red, fontSize: 12, fontWeight: "700" },
  rowRight: { width: 92, alignItems: "flex-end" },
  mcText: { color: colors.text, fontWeight: "800", fontSize: 14 },
  multiple: { color: colors.green, fontWeight: "900", fontSize: 16, backgroundColor: "rgba(127,240,165,0.14)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, marginVertical: 8 },
  callerCard: { padding: 18, backgroundColor: colors.panel, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  callerFeatured: { backgroundColor: "#15231c", borderColor: "#254d37" },
  callerTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  rank: { color: colors.muted, fontWeight: "800" },
  calls: { color: colors.text, fontWeight: "800" },
  callerIdentity: { flexDirection: "row", alignItems: "center", gap: 13 },
  callerAvatar: { width: 54, height: 54, borderRadius: 27 },
  callerAvatarBig: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: colors.green },
  callerName: { color: colors.text, fontSize: 18, fontWeight: "800" },
  callerNameBig: { color: colors.text, fontSize: 24, fontWeight: "900", fontStyle: "italic" },
  bestLabel: { color: colors.muted, fontSize: 12, marginTop: 14 },
  bestMultiple: { color: colors.text, fontSize: 58, fontWeight: "900", letterSpacing: -1 },
  statsGrid: { borderTopWidth: 1, borderColor: colors.border, marginTop: 14, paddingTop: 14, flexDirection: "row", justifyContent: "space-between" },
  metricLabel: { color: colors.muted, fontSize: 12 },
  metricValue: { color: colors.text, fontWeight: "800", fontSize: 16, marginTop: 4 },
  navWrap: { position: "absolute", left: 20, right: 20, bottom: 18, flexDirection: "row", alignItems: "center", gap: 12 },
  navBar: { flex: 1, height: 72, borderRadius: 36, backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-around", ...shadow },
  navItem: { width: 64, height: 64, alignItems: "center", justifyContent: "center" },
  createFab: { width: 74, height: 74, borderRadius: 37, backgroundColor: colors.green, alignItems: "center", justifyContent: "center", ...shadow }
});
