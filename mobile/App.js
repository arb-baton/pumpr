import React, { Component, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { BottomNav, CalledCard, CallerCard, CoinRow, IconButton, Metric, MiniSparkline, Pill, Screen, SectionTitle } from "./src/components";
import { API_BASE, loadAlpha, loadGo, loadHomeFeed } from "./src/api";
import { alphaTips as fallbackAlpha, bounties as fallbackBounties, callers, demoCoins, spark } from "./src/mockData";
import { colors, radii, shadow, spacing } from "./src/theme";

const brandLogo = require("./assets/icon.png");

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <SafeAreaView style={styles.app}>
          <View style={styles.fallbackScreen}>
            <Image source={brandLogo} style={styles.fallbackLogo} />
            <Text style={styles.bigTitle}>Pump-r could not start</Text>
            <Text style={styles.subText}>{String(this.state.error?.message || this.state.error || "Unknown mobile error")}</Text>
            <Text style={styles.bottomNote}>Restart Metro with npm.cmd run start -- --clear and reload Expo Go.</Text>
          </View>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

function chainColor(chain) {
  if (chain === "BASE") return colors.blue;
  if (chain === "MONAD") return colors.purple;
  if (chain === "SOL") return colors.green;
  return colors.green;
}

function Header({ balance, onWallet, onSettings }) {
  return (
    <View style={styles.header}>
      <Image source={brandLogo} style={styles.headerAvatar} />
      <Text style={styles.balance}>{balance}</Text>
      <Pressable style={styles.depositMini} onPress={onWallet}>
        <Text style={styles.depositMiniText}>Deposit</Text>
      </Pressable>
      <View style={{ flex: 1 }} />
      <IconButton name="notifications-outline" size={54} onPress={() => Notifications.requestPermissionsAsync()} />
      <IconButton name="scan-outline" size={54} onPress={onSettings} />
    </View>
  );
}

function SearchDock({ onDeposit }) {
  return (
    <View style={styles.searchDock}>
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={22} color={colors.muted} />
        <Text style={styles.searchText}>Search for a coin</Text>
        <Pill>Paste</Pill>
      </View>
      <Pressable style={styles.depositDock} onPress={onDeposit}>
        <Text style={styles.depositDockText}>Deposit</Text>
      </Pressable>
    </View>
  );
}

function HomeScreen({ coins, onToken, onDeposit }) {
  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBottom}>
        <SectionTitle title="Top" accent="Called" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {coins.slice(0, 5).map((coin, index) => (
            <CalledCard key={coin.id} coin={coin} index={index} onPress={() => onToken(coin)} />
          ))}
        </ScrollView>

        <SectionTitle
          title="Top"
          accent="Callers"
          right={<Pill icon="options-outline">Score</Pill>}
        />
        <View style={styles.segment}>
          <Pill active>WEEKLY</Pill>
          <Pill>MONTHLY</Pill>
        </View>
        <CallerCard caller={callers[0]} featured />
        {callers.slice(1).map((caller) => (
          <CallerCard key={caller.rank} caller={caller} />
        ))}
      </ScrollView>
      <SearchDock onDeposit={onDeposit} />
    </Screen>
  );
}

function MarketsScreen({ coins, onToken, onDeposit }) {
  const [filter, setFilter] = useState("Movers");
  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBottom}>
        <View style={styles.filterHeader}>
          <IconButton name="filter-outline" size={64} />
          {["Movers", "Mayhem", "New", "Soon"].map((item) => (
            <Pressable key={item} onPress={() => setFilter(item)}>
              <Text style={[styles.marketTab, filter === item && styles.marketTabActive]}>{item}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.newMoverBanner}>
          <Text style={styles.newMoverText}>↑ {Math.max(1, coins.length - 1)} new movers</Text>
        </View>
        {coins.map((coin) => (
          <CoinRow key={coin.id} coin={coin} onPress={() => onToken(coin)} />
        ))}
      </ScrollView>
      <SearchDock onDeposit={onDeposit} />
    </Screen>
  );
}

function TokenScreen({ coin, onBack, onDeposit }) {
  const [side, setSide] = useState("buy");
  const [amount, setAmount] = useState("0.1");
  const [holding, setHolding] = useState(0);
  const [balance, setBalance] = useState(5);
  const chart = useMemo(() => spark(7, 42), [coin?.id]);
  if (!coin) return null;

  function trade() {
    const numeric = Number(amount || 0);
    if (!numeric || numeric <= 0) return Alert.alert("Enter an amount", "Select or type an amount first.");
    if (side === "buy") {
      if (numeric > balance) return Alert.alert("Insufficient balance", "Deposit or choose a smaller amount.");
      setBalance((v) => +(v - numeric).toFixed(3));
      setHolding((v) => +(v + numeric * 125000).toFixed(0));
      return Alert.alert("Practice buy filled", `Bought with ${numeric} ${coin.chain === "SOL" ? "SOL" : "ETH"}.`);
    }
    const sellTokens = numeric > 1 ? numeric : holding * numeric;
    if (sellTokens <= 0 || sellTokens > holding) return Alert.alert("Nothing to sell", "Choose a smaller sell amount.");
    setHolding((v) => +(v - sellTokens).toFixed(0));
    setBalance((v) => +(v + sellTokens / 140000).toFixed(3));
    Alert.alert("Practice sell filled", `Sold ${sellTokens.toLocaleString()} ${coin.symbol}.`);
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBottom}>
        <View style={styles.tokenTop}>
          <IconButton name="chevron-back" size={46} onPress={onBack} />
          <Text style={styles.tokenMini}>{coin.symbol} · {coin.age} · 👁 {coin.holders}</Text>
          <View style={{ flex: 1 }} />
          <IconButton name="megaphone-outline" size={46} />
          <IconButton name="star-outline" size={46} />
          <IconButton name="share-social-outline" size={46} onPress={() => Linking.openURL(`https://x.com/intent/tweet?text=${encodeURIComponent(`${coin.name} on Pump Fun Remastered ${API_BASE}`)}`)} />
        </View>
        <View style={styles.tokenHero}>
          <Image source={{ uri: coin.image }} style={styles.tokenImage} />
          <View style={{ flex: 1 }}>
            <Text style={styles.tokenName}>{coin.name}</Text>
            <Text style={styles.tokenAddress}>{coin.address || "launch pending"} ★ X</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.tokenMc}>{coin.mc}</Text>
            <Text style={styles.greenText}>● {coin.change} (24h)</Text>
          </View>
        </View>
        <View style={styles.chartTabs}>
          {["1h", "MCAP/USD", "USD/SOL"].map((tab) => <Text key={tab} style={[styles.chartTab, tab.includes("MCAP") && styles.chartTabActive]}>{tab}</Text>)}
          <View style={{ flex: 1 }} />
          <Ionicons name="arrow-undo-outline" size={22} color={colors.muted} />
          <Ionicons name="arrow-redo-outline" size={22} color={colors.muted} />
        </View>
        <View style={styles.bigChart}>
          <MiniSparkline data={chart} height={310} />
          <Text style={styles.chartPrice}>{coin.mc}</Text>
        </View>
        <View style={styles.timeTabs}>
          {["1s", "1m", "5m", "15m", "1h"].map((tab) => <Text key={tab} style={styles.timeTab}>{tab}</Text>)}
          <View style={{ flex: 1 }} />
          <Text style={styles.greenText}>🔔 Price alert</Text>
        </View>
        <View style={styles.tradeBox}>
          <View style={styles.tradeSwitch}>
            <Pressable onPress={() => setSide("buy")} style={[styles.tradeSide, side === "buy" && styles.tradeSideActive]}><Text style={styles.tradeSideText}>Buy</Text></Pressable>
            <Pressable onPress={() => setSide("sell")} style={[styles.tradeSide, side === "sell" && styles.tradeSideActive]}><Text style={styles.tradeSideText}>Sell</Text></Pressable>
          </View>
          <View style={styles.balanceLine}>
            <Text style={styles.muted}>● Balance</Text>
            <Text style={styles.textStrong}>${(balance * 160).toFixed(2)} · {balance} {coin.chain === "SOL" ? "SOL" : "ETH"}</Text>
            <Text style={styles.textStrong}>Hold {holding.toLocaleString()} {coin.symbol}</Text>
          </View>
          <View style={styles.amountGrid}>
            {(side === "buy" ? ["0.05", "0.1", "0.5"] : ["25%", "50%", "100%"]).map((item) => (
              <Pressable key={item} style={styles.amountBtn} onPress={() => setAmount(side === "sell" ? String(parseFloat(item) / 100) : item)}>
                <Text style={styles.amountText}>{item} {side === "buy" ? coin.chain === "SOL" ? "◎" : "Ξ" : ""}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Enter amount" placeholderTextColor={colors.faint} style={styles.input} />
          <Pressable style={styles.primaryBtn} onPress={trade}>
            <Text style={styles.primaryBtnText}>{side === "buy" ? "Buy" : "Sell"} {coin.symbol}</Text>
          </Pressable>
        </View>
        <View style={styles.socialTabs}>
          {["Social", `Holders (${coin.holders})`, "About"].map((tab, i) => <Text key={tab} style={[styles.socialTab, i === 0 && styles.socialTabActive]}>{tab}</Text>)}
        </View>
        <Pressable style={styles.primaryBtnLarge} onPress={onDeposit}>
          <Ionicons name="arrow-down-circle" size={22} color={colors.black} />
          <Text style={styles.primaryLargeText}>Deposit</Text>
        </Pressable>
        <Text style={styles.aboutText}>{coin.description}</Text>
      </ScrollView>
    </Screen>
  );
}

function CommunitiesScreen() {
  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBottom}>
        <View style={styles.pageTitleRow}>
          <Text style={styles.pageTitle}>Communities</Text>
        </View>
        <View style={styles.feedTabs}><Text style={styles.feedActive}>Feed</Text><Text style={styles.feedTab}>Top communities</Text></View>
        {[1, 2, 3].map((item) => (
          <View key={item} style={styles.communityPost}>
            <Pill active={item === 1}>PUMPR</Pill>
            <Text style={styles.postTitle}>{item === 1 ? "Pump Fun Remastered" : "Builder Club"} <Text style={styles.muted}>@pumpr_fun · {item + 2}h</Text></Text>
            <Text style={styles.postBody}>Every legendary community eventually develops its own lore. What should the first Pump-r chapter be called?</Text>
            <Image source={brandLogo} style={styles.postImage} />
            <View style={styles.postActions}><Text style={styles.muted}>♡ {20 + item}</Text><Text style={styles.muted}>⇧ Share</Text></View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

function GoScreen({ bounties }) {
  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBottom}>
        <Text style={styles.kicker}>BOUNTIES</Text>
        <Text style={styles.bigTitle}>Trending</Text>
        <Text style={styles.subText}>Bounties and submissions gaining momentum</Text>
        <View style={styles.feedTabs}><Text style={styles.feedActive}>Trending</Text><Text style={styles.feedTab}>Bounties</Text><Text style={styles.feedTab}>Submissions</Text></View>
        {bounties.map((bounty) => (
          <View key={bounty.id} style={styles.bountyCard}>
            <View style={styles.rowBetween}><Pill active>{bounty.status}</Pill><Text style={styles.reward}>{bounty.reward}</Text></View>
            <Text style={styles.postTitle}>{bounty.title}</Text>
            <Text style={styles.postBody}>{bounty.title}. Clear proof, clean delivery, and public-safe execution.</Text>
            <Text style={styles.greenText}>{bounty.token}</Text>
            <View style={styles.rowBetween}><Text style={styles.muted}>{bounty.left} left</Text><Text style={styles.muted}>{bounty.subs} subs</Text></View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

function AlphaScreen({ alpha }) {
  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBottom}>
        <Text style={styles.kicker}>PUBLIC PROJECT INTEL</Text>
        <Text style={styles.bigTitle}>Alpha vault</Text>
        <Text style={styles.subText}>Submit high-signal tips tied to a token. Readers can rate, comment, share on X, and tip.</Text>
        <View style={styles.feedTabs}><Text style={styles.feedActive}>All</Text><Text style={styles.feedTab}>High conviction</Text><Text style={styles.feedTab}>New</Text><Text style={styles.feedTab}>Tipped</Text></View>
        {alpha.map((tip) => (
          <View key={tip.id} style={styles.alphaCard}>
            <View style={styles.rowBetween}><Pill active>{tip.chain}</Pill><Pill>+{tip.score} SCORE</Pill></View>
            <Text style={styles.kicker}>{tip.category || "LAUNCHPAD, MULTI-CHAIN, SOCIAL ALPHA"}</Text>
            <Text style={styles.alphaTitle}>{tip.title}</Text>
            <Text style={styles.postBody}>{tip.teaser}</Text>
            <View style={styles.alphaProject}><Image source={brandLogo} style={styles.alphaLogo} /><View><Text style={styles.textStrong}>{tip.project}</Text><Text style={styles.muted}>${tip.symbol} token thesis</Text></View></View>
            <View style={styles.rowBetween}><Text style={styles.muted}>{tip.author}</Text><Text style={styles.muted}>💬 {tip.comments}</Text></View>
            <View style={styles.actionRow}><Pill>👍 Up</Pill><Pill>👎 Down</Pill><Pill>Share X</Pill></View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

function WalletScreen({ onDeposit, onCreate, onSettings }) {
  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBottom}>
        <View style={styles.profileHero}>
          <Image source={brandLogo} style={styles.profileAvatar} />
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>wildkrakencrypt</Text>
            <Text style={styles.muted}>E8WD...m6z9 ★</Text>
          </View>
          <Text style={styles.walletValue}>$0.00</Text>
        </View>
        <View style={styles.profileStats}><Text style={styles.muted}>0 Following</Text><Text style={styles.muted}>0 Followers</Text><Text style={styles.muted}>0 Coins</Text></View>
        <View style={styles.feedTabs}><Text style={styles.feedActive}>Portfolio</Text><Text style={styles.feedTab}>Callouts</Text><Text style={styles.feedTab}>Activity</Text><Text style={styles.feedTab}>Created</Text></View>
        <Text style={styles.bigTitle}>Deposit</Text>
        <View style={styles.depositPanel}>
          <Text style={styles.postTitle}>Manual transfer</Text>
          <View style={styles.actionRow}><Pressable style={styles.primaryBtnSmall} onPress={onDeposit}><Text style={styles.primaryBtnText}>Receive</Text></Pressable><Pill icon="star">Copy address</Pill></View>
        </View>
        {["Phantom", "Google Pay", "Debit Card", "Cross-chain Deposit", "PayPal", "Venmo"].map((item) => (
          <Pressable key={item} style={styles.settingsRow}>
            <Text style={styles.settingsText}>{item}</Text>
            <Ionicons name="arrow-forward" size={22} color={colors.muted} />
          </Pressable>
        ))}
        <Pressable style={styles.primaryBtnLarge} onPress={onCreate}><Text style={styles.primaryLargeText}>Create a coin</Text></Pressable>
        <Pressable style={styles.secondaryBtn} onPress={onSettings}><Text style={styles.textStrong}>Manage account</Text></Pressable>
      </ScrollView>
    </Screen>
  );
}

function DepositSheet({ visible, onClose }) {
  async function copy() {
    await Clipboard.setStringAsync("pumpr-demo-wallet-address");
    Alert.alert("Copied", "Deposit address copied.");
  }
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalShade}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>Deposit to your account</Text>
          {[
            ["Instant deposit", "Use Google Pay, card, PayPal and more.", "card-outline"],
            ["Cross chain deposit", "Send BTC, ETH, USDC and more.", "logo-bitcoin"],
            ["Phantom", "Connect and transfer from Phantom.", "wallet-outline"],
            ["Solflare", "Connect and transfer from Solflare.", "sunny-outline"],
            ["Robinhood", "Connect and transfer from Robinhood.", "leaf-outline"]
          ].map(([title, body, icon]) => (
            <Pressable key={title} style={styles.depositOption}>
              <View><Text style={styles.postTitle}>{title}</Text><Text style={styles.subText}>{body}</Text></View>
              <Ionicons name={icon} size={32} color={colors.green} />
            </Pressable>
          ))}
          <View style={styles.depositOption}>
            <View><Text style={styles.postTitle}>Manual transfer</Text><Text style={styles.subText}>Transfer SOL from wallet or exchange.</Text></View>
            <View style={styles.actionRow}><Pill icon="qr-code-outline">Scan QR</Pill><Pressable onPress={copy}><Pill icon="star">Copy</Pill></Pressable></View>
          </View>
          <Pressable style={styles.closeBtn} onPress={onClose}><Text style={styles.textStrong}>Close</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

function CreateSheet({ visible, onClose, onCreated }) {
  const [image, setImage] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [mode, setMode] = useState("Pump.fun");
  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.82 });
    if (!result.canceled && result.assets?.[0]?.uri) setImage(result.assets[0].uri);
  }
  function submit() {
    if (!name || !symbol) return Alert.alert("Missing details", "Name and ticker are required.");
    onCreated({
      id: `${symbol}-${Date.now()}`,
      name,
      symbol,
      subtitle: `${mode} launch rehearsal`,
      mc: "Syncing",
      change: "+0.0%",
      multiple: "1x",
      chain: mode === "Pump.fun" ? "SOL" : mode.includes("Base") ? "BASE" : mode.includes("Monad") ? "MONAD" : "ETH",
      image: image || `${API_BASE}/assets/pump-r-logo.png`,
      age: "now",
      description: `${name} launched through ${mode}.`,
      holders: 1,
      address: "pending"
    });
    setName("");
    setSymbol("");
    setImage("");
    onClose();
  }
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalShade}>
        <View style={styles.sheetFull}>
          <View style={styles.modalHeader}><Pressable onPress={onClose}><Ionicons name="close" size={30} color={colors.text} /></Pressable><Text style={styles.sheetTitle}>Create a coin</Text><Ionicons name="locate-outline" size={26} color={colors.muted} /></View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.formLabel}>Launch route</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              {["Pump.fun", "Ethereum", "Base", "Monad", "PumpVerse", "ETH + USDC"].map((item) => (
                <Pressable key={item} onPress={() => setMode(item)}><Pill active={mode === item} style={{ marginRight: 8 }}>{item}</Pill></Pressable>
              ))}
            </ScrollView>
            <Text style={styles.formLabel}>Media</Text>
            <Pressable style={styles.uploadBox} onPress={pickImage}>
              {image ? <Image source={{ uri: image }} style={styles.uploadPreview} /> : <><Ionicons name="image-outline" size={44} color={colors.text} /><Text style={styles.subText}>Upload image or video</Text></>}
            </Pressable>
            <Text style={styles.formLabel}>Name</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Enter coin name" placeholderTextColor={colors.faint} style={styles.inputTall} />
            <Text style={styles.formLabel}>Ticker</Text>
            <TextInput value={symbol} onChangeText={setSymbol} autoCapitalize="characters" placeholder="Add ticker (e.g. DOGE)" placeholderTextColor={colors.faint} style={styles.inputTall} />
            <Text style={styles.formLabel}>Description</Text>
            <TextInput multiline placeholder="Enter coin description" placeholderTextColor={colors.faint} style={[styles.inputTall, { height: 120, textAlignVertical: "top" }]} />
          </ScrollView>
          <Pressable style={styles.primaryBtnLarge} onPress={submit}><Text style={styles.primaryLargeText}>Next</Text></Pressable>
          <Text style={styles.bottomNote}>Coin data cannot be changed after creation.</Text>
        </View>
      </View>
    </Modal>
  );
}

function SettingsSheet({ visible, onClose }) {
  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={styles.settingsScreen}>
        <View style={styles.modalHeader}><Pressable onPress={onClose}><Ionicons name="chevron-back" size={32} color={colors.text} /></Pressable><View><Text style={styles.sheetTitle}>Manage account</Text><Text style={styles.subText}>Logged in with wallet</Text></View><View style={{ width: 32 }} /></View>
        <ScrollView>
          <View style={styles.noticeCard}><Ionicons name="notifications-outline" size={34} color={colors.text} /><Text style={styles.postTitle}>Notifications disabled</Text><Text style={styles.subText}>Enable notifications to stay updated.</Text><Pressable style={styles.primaryBtn} onPress={() => Notifications.requestPermissionsAsync()}><Text style={styles.primaryBtnText}>Open settings</Text></Pressable></View>
          {["Edit profile", "View wallets", "Link social media account", "Coin community settings", "Appearance", "Notifications", "Transactions", "Language", "Settings", "FAQs", "Legal", "Live chat"].map((item) => (
            <View key={item} style={styles.settingsRow}><Text style={[styles.settingsText, item === "Live chat" && { color: colors.green }]}>{item}</Text><Ionicons name="chevron-forward" size={22} color={colors.muted} /></View>
          ))}
          <View style={styles.noticeCard}><Text style={styles.postTitle}>Pro mode</Text><Text style={styles.subText}>Showing advanced data and filters</Text><View style={styles.toggle}><View style={styles.toggleKnob} /></View></View>
          <Pressable style={styles.logout}><Text style={styles.logoutText}>Log out</Text></Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function PumpRApp() {
  const [active, setActive] = useState("home");
  const [coins, setCoins] = useState(demoCoins);
  const [alpha, setAlpha] = useState(fallbackAlpha);
  const [goRows, setGoRows] = useState(fallbackBounties);
  const [selected, setSelected] = useState(null);
  const [depositOpen, setDepositOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    loadHomeFeed().then(setCoins);
    loadAlpha().then(setAlpha);
    loadGo().then(setGoRows);
  }, []);

  function content() {
    if (selected) return <TokenScreen coin={selected} onBack={() => setSelected(null)} onDeposit={() => setDepositOpen(true)} />;
    if (active === "markets") return <MarketsScreen coins={coins} onToken={setSelected} onDeposit={() => setDepositOpen(true)} />;
    if (active === "communities") return <CommunitiesScreen />;
    if (active === "wallet") return <WalletScreen onDeposit={() => setDepositOpen(true)} onCreate={() => setCreateOpen(true)} onSettings={() => setSettingsOpen(true)} />;
    if (active === "go") return <GoScreen bounties={goRows} />;
    if (active === "alpha") return <AlphaScreen alpha={alpha} />;
    return <HomeScreen coins={coins} onToken={setSelected} onDeposit={() => setDepositOpen(true)} />;
  }

  return (
    <SafeAreaView style={styles.app}>
      <ExpoStatusBar style="light" />
      <StatusBar barStyle="light-content" />
      {!selected ? <Header balance="$0.00" onWallet={() => setDepositOpen(true)} onSettings={() => setSettingsOpen(true)} /> : null}
      {content()}
      {!selected ? (
        <View style={styles.quickTabs}>
          {["home", "markets", "go", "alpha"].map((item) => (
            <Pressable key={item} onPress={() => setActive(item)}>
              <Text style={[styles.quickTab, active === item && styles.quickTabActive]}>{item === "markets" ? "Movers" : item.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <BottomNav active={active} onSelect={(key) => { setSelected(null); setActive(key); }} onCreate={() => setCreateOpen(true)} />
      <DepositSheet visible={depositOpen} onClose={() => setDepositOpen(false)} />
      <CreateSheet visible={createOpen} onClose={() => setCreateOpen(false)} onCreated={(coin) => { setCoins((rows) => [coin, ...rows]); setSelected(coin); }} />
      <SettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <PumpRApp />
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.bg },
  fallbackScreen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 14 },
  fallbackLogo: { width: 112, height: 112, borderRadius: 28 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 22, paddingTop: 10, paddingBottom: 12, gap: 10 },
  headerAvatar: { width: 42, height: 42, borderRadius: 21 },
  balance: { color: colors.text, fontSize: 26, fontWeight: "900" },
  depositMini: { backgroundColor: colors.green, borderRadius: radii.pill, paddingHorizontal: 18, paddingVertical: 10 },
  depositMiniText: { color: colors.black, fontWeight: "900" },
  scrollBottom: { paddingBottom: 138 },
  segment: { flexDirection: "row", gap: 8, marginBottom: 14 },
  filterHeader: { flexDirection: "row", alignItems: "center", gap: 20, paddingTop: 8, marginBottom: 16 },
  marketTab: { color: colors.muted, fontSize: 23, fontWeight: "900" },
  marketTabActive: { color: colors.green, textDecorationLine: "underline" },
  newMoverBanner: { height: 58, borderRadius: radii.xl, backgroundColor: colors.panel, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  newMoverText: { color: colors.green, fontSize: 18, fontWeight: "800" },
  searchDock: { position: "absolute", left: 22, right: 22, bottom: 102, flexDirection: "row", gap: 10 },
  searchBox: { flex: 1, height: 64, borderRadius: 32, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", paddingHorizontal: 18, gap: 10, ...shadow },
  searchText: { color: colors.muted, fontSize: 18, flex: 1 },
  depositDock: { height: 64, borderRadius: 32, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", paddingHorizontal: 22, backgroundColor: colors.panel },
  depositDockText: { color: colors.text, fontWeight: "900", fontSize: 16 },
  tokenTop: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10 },
  tokenMini: { color: colors.muted, fontSize: 15, fontWeight: "700" },
  tokenHero: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 18 },
  tokenImage: { width: 88, height: 88, borderRadius: 18, borderWidth: 2, borderColor: colors.green },
  tokenName: { color: colors.text, fontSize: 27, fontWeight: "900" },
  tokenAddress: { color: colors.muted, fontSize: 14, marginTop: 4 },
  tokenMc: { color: colors.text, fontSize: 32, fontWeight: "900" },
  chartTabs: { flexDirection: "row", alignItems: "center", gap: 18, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  chartTab: { color: colors.muted, fontWeight: "800", fontSize: 16 },
  chartTabActive: { color: colors.green },
  bigChart: { minHeight: 350, borderBottomWidth: 1, borderColor: colors.border, justifyContent: "center" },
  chartPrice: { position: "absolute", right: 0, top: 90, backgroundColor: colors.red, color: colors.text, paddingHorizontal: 8, paddingVertical: 4, fontWeight: "900" },
  timeTabs: { flexDirection: "row", gap: 26, paddingVertical: 18 },
  timeTab: { color: colors.muted, fontWeight: "800", fontSize: 16 },
  tradeBox: { padding: 16, borderRadius: radii.lg, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  tradeSwitch: { flexDirection: "row", backgroundColor: colors.black, borderRadius: radii.pill, marginBottom: 12, padding: 4 },
  tradeSide: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: radii.pill },
  tradeSideActive: { backgroundColor: colors.green2 },
  tradeSideText: { color: colors.text, fontWeight: "900" },
  balanceLine: { gap: 5, marginBottom: 12 },
  amountGrid: { flexDirection: "row", gap: 10 },
  amountBtn: { flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: radii.pill, backgroundColor: "rgba(0,120,30,0.55)" },
  amountText: { color: colors.green, fontWeight: "900", fontSize: 16 },
  input: { marginTop: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.black, color: colors.text, padding: 14, borderRadius: radii.md, fontSize: 16 },
  primaryBtn: { backgroundColor: colors.green, borderRadius: radii.pill, paddingVertical: 15, alignItems: "center", marginTop: 14 },
  primaryBtnText: { color: colors.black, fontWeight: "900", fontSize: 16 },
  primaryBtnLarge: { minHeight: 78, borderRadius: 39, backgroundColor: colors.green, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10, marginTop: 16 },
  primaryLargeText: { color: colors.black, fontWeight: "900", fontSize: 20 },
  socialTabs: { flexDirection: "row", justifyContent: "space-around", borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 18 },
  socialTab: { color: colors.muted, fontWeight: "800", fontSize: 16 },
  socialTabActive: { color: colors.text, textDecorationLine: "underline" },
  aboutText: { color: colors.muted, fontSize: 16, lineHeight: 24, marginTop: 18 },
  pageTitleRow: { alignItems: "center", marginTop: 12 },
  pageTitle: { color: colors.text, fontSize: 22, fontWeight: "900" },
  feedTabs: { flexDirection: "row", gap: 26, marginVertical: 18 },
  feedActive: { color: colors.text, fontSize: 18, fontWeight: "900", textDecorationLine: "underline", textDecorationColor: colors.green },
  feedTab: { color: colors.muted, fontSize: 18, fontWeight: "800" },
  communityPost: { paddingVertical: 20, borderBottomWidth: 1, borderColor: colors.border },
  postTitle: { color: colors.text, fontSize: 20, fontWeight: "900", marginTop: 8 },
  postBody: { color: colors.text, fontSize: 16, lineHeight: 24, marginVertical: 14 },
  postImage: { width: "100%", height: 240, borderRadius: radii.md, backgroundColor: colors.panel2 },
  postActions: { flexDirection: "row", gap: 34, marginTop: 14 },
  kicker: { color: colors.green, fontWeight: "900", fontSize: 13, letterSpacing: 1, marginTop: 18 },
  bigTitle: { color: colors.text, fontSize: 33, fontWeight: "900", marginTop: 4 },
  subText: { color: colors.muted, fontSize: 16, lineHeight: 22 },
  bountyCard: { padding: 18, borderRadius: radii.lg, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, marginBottom: 14 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  reward: { color: colors.green, fontSize: 28, fontWeight: "900" },
  alphaCard: { padding: 18, borderRadius: radii.lg, backgroundColor: "#102018", borderColor: "#245d3e", borderWidth: 1, marginBottom: 14 },
  alphaTitle: { color: colors.text, fontSize: 25, fontWeight: "900", marginTop: 8 },
  alphaProject: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: colors.panel, borderRadius: radii.md, marginVertical: 14 },
  alphaLogo: { width: 52, height: 52, borderRadius: 26 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  profileHero: { flexDirection: "row", alignItems: "center", gap: 14, paddingTop: 18 },
  profileAvatar: { width: 76, height: 76, borderRadius: 18 },
  profileName: { color: colors.text, fontSize: 18, fontWeight: "900" },
  walletValue: { color: colors.text, fontSize: 42, fontWeight: "900" },
  profileStats: { flexDirection: "row", gap: 20, marginVertical: 14 },
  depositPanel: { backgroundColor: colors.panel, borderRadius: radii.lg, padding: 18, marginTop: 16 },
  primaryBtnSmall: { backgroundColor: colors.green, paddingHorizontal: 34, paddingVertical: 18, borderRadius: radii.pill },
  settingsRow: { minHeight: 72, backgroundColor: colors.panel, borderBottomWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 22 },
  settingsText: { color: colors.text, fontSize: 22, fontWeight: "700" },
  secondaryBtn: { borderColor: colors.border, borderWidth: 1, borderRadius: radii.pill, alignItems: "center", paddingVertical: 15, marginTop: 14 },
  modalShade: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.panel, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, maxHeight: "92%" },
  sheetFull: { backgroundColor: colors.panel, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, height: "92%" },
  grabber: { width: 64, height: 5, borderRadius: 4, backgroundColor: colors.border, alignSelf: "center", marginBottom: 18 },
  sheetTitle: { color: colors.text, fontSize: 21, fontWeight: "900", textAlign: "center" },
  depositOption: { backgroundColor: colors.panel2, borderRadius: radii.lg, padding: 20, marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  closeBtn: { backgroundColor: colors.panel3, borderRadius: radii.pill, alignItems: "center", paddingVertical: 16, marginTop: 18 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  formLabel: { color: colors.text, fontWeight: "900", fontSize: 16, marginTop: 14, marginBottom: 8 },
  uploadBox: { minHeight: 132, borderWidth: 1, borderStyle: "dashed", borderColor: colors.muted, borderRadius: radii.md, alignItems: "center", justifyContent: "center", gap: 8, overflow: "hidden" },
  uploadPreview: { width: "100%", height: 180 },
  inputTall: { minHeight: 72, borderRadius: radii.md, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 18, fontSize: 18 },
  bottomNote: { color: colors.muted, textAlign: "center", marginTop: 12 },
  settingsScreen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 22 },
  noticeCard: { backgroundColor: colors.panel, borderRadius: radii.lg, padding: 22, marginVertical: 12 },
  toggle: { position: "absolute", right: 22, top: 24, width: 78, height: 46, borderRadius: 23, backgroundColor: colors.green, alignItems: "flex-end", justifyContent: "center", padding: 4 },
  toggleKnob: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.text },
  logout: { alignSelf: "center", backgroundColor: "#5a0e0e", borderRadius: radii.pill, paddingHorizontal: 54, paddingVertical: 18, marginVertical: 30 },
  logoutText: { color: "#ff9b9b", fontWeight: "900", fontSize: 18 },
  textStrong: { color: colors.text, fontWeight: "900" },
  greenText: { color: colors.green, fontWeight: "800" },
  quickTabs: { position: "absolute", left: 18, right: 18, bottom: 190, flexDirection: "row", justifyContent: "center", gap: 10 },
  quickTab: { color: colors.muted, fontWeight: "900", fontSize: 12, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.panel, borderRadius: radii.pill, overflow: "hidden" },
  quickTabActive: { color: colors.black, backgroundColor: colors.green }
});
