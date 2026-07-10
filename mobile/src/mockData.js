export const demoCoins = [
  {
    id: "pumpr",
    name: "Pump Fun Remastered",
    symbol: "PUMPR",
    subtitle: "Official launchpad token",
    mc: "$1.5K",
    change: "+8.8%",
    multiple: "8x",
    chain: "SOL",
    image: "https://pump-r.fun/assets/pump-r-logo.png",
    age: "1h",
    description: "Fast meme launches across Solana, Ethereum, Base, Monad and PumpVerse.",
    address: "pumpr...soon",
    holders: 981
  },
  {
    id: "ethusd",
    name: "Eth USD pair Test",
    symbol: "ETHUSD",
    subtitle: "USDC pair",
    mc: "$1.5K",
    change: "+0.4%",
    multiple: "4x",
    chain: "ETH",
    quote: "USDC",
    image: "https://pump-r.fun/assets/pump-r-logo.png",
    age: "4d",
    description: "ETH launch with USDC quote pair support.",
    address: "0x...usdc",
    holders: 220
  },
  {
    id: "base",
    name: "Base Test",
    symbol: "BTEST",
    subtitle: "Base launch",
    mc: "$824",
    change: "+1.3%",
    multiple: "5x",
    chain: "BASE",
    image: "https://pump-r.fun/assets/pump-r-logo.png",
    age: "6d",
    description: "Base bonding-curve token launch.",
    address: "0x...base",
    holders: 112
  },
  {
    id: "monad",
    name: "Monad Test",
    symbol: "MONTEST",
    subtitle: "Monad launch",
    mc: "$824",
    change: "+1.6%",
    multiple: "6x",
    chain: "MONAD",
    image: "https://pump-r.fun/assets/pump-r-logo.png",
    age: "5d",
    description: "Monad-compatible EVM bonding-curve launch.",
    address: "0x...monad",
    holders: 84
  }
];

export const callers = [
  { rank: 1, name: "degenordie", handle: "2k6zN...fTPBB", avatar: "https://pump-r.fun/assets/support-avatar-1.jpg", calls: 48, best: "160.50x", median: "1.49x", twoX: "40.0%", oneFiveX: "47.9%", ttp: "8.4h" },
  { rank: 2, name: "buddha.sol", handle: "caller", avatar: "https://pump-r.fun/assets/support-avatar-2.jpg", calls: 47, best: "88.40x", median: "1.68x", twoX: "45.0%", oneFiveX: "59.6%", ttp: "7.2h" },
  { rank: 3, name: "rarebreedxl", handle: "caller", avatar: "https://pump-r.fun/assets/support-avatar-3.jpg", calls: 50, best: "64.30x", median: "1.57x", twoX: "22.0%", oneFiveX: "56.0%", ttp: "6.9h" },
  { rank: 4, name: "iapetops1", handle: "caller", avatar: "https://pump-r.fun/assets/pepe-card.jpg", calls: 43, best: "45.10x", median: "1.59x", twoX: "33.0%", oneFiveX: "53.5%", ttp: "9.1h" }
];

export const bounties = [
  { id: "b1", title: "Make a viral Pump-r launch clip", reward: "$206.92", token: "3 SOL", status: "OPEN", subs: 7, left: "2d 23h", creator: "ultrasquidferoc" },
  { id: "b2", title: "Create X branding for $PUMPR", reward: "$689.45", token: "10 MON", status: "OPEN", subs: 2, left: "3d", creator: "degenbuilder" },
  { id: "b3", title: "Find the strongest new coin thesis", reward: "$41.37", token: "0.6 ETH", status: "SUBMISSION", subs: 12, left: "17m", creator: "alphapilot" }
];

export const alphaTips = [
  { id: "a1", title: "PUMPR official account live", project: "Pump Fun Remastered", symbol: "PUMPR", chain: "SOL", score: 12, author: "@pumpr_fun", teaser: "Watch the official X account and launch routing across Sol, ETH, Base, Monad.", comments: 3 },
  { id: "a2", title: "USDC pairs changing entries", project: "Eth USD pair Test", symbol: "ETHUSD", chain: "ETH", score: 8, author: "@alphaPilot", teaser: "Stable quote pairs make entries easier for newer buyers during volatility.", comments: 5 }
];

export function spark(seed = 1, count = 34) {
  let value = 20 + seed * 4;
  return Array.from({ length: count }, (_, index) => {
    const wave = Math.sin((index + seed) / 2.7) * 8;
    const pulse = index > count * 0.68 ? (index - count * 0.68) * 2.4 : 0;
    value = Math.max(8, value + Math.sin(index * seed) * 2 + wave * 0.04 + pulse * 0.05);
    return Math.min(95, value + wave + pulse);
  });
}
