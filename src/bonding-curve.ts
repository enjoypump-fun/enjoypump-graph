import { BigInt, Bytes, Address, ethereum } from "@graphprotocol/graph-ts";
import {
  Buy,
  Sell,
  bonding_curve,
} from "../generated/bonding-curve/bonding_curve";
import {
  BondingCurve,
  BondingCurveTrade,
  Holder,
  BondingCurveHourBucket,
  BondingCurveMinuteBucket,
} from "../generated/schema";

class BucketAggregate {
  volume: BigInt;
  high: BigInt;
  low: BigInt;
  open: BigInt;
  close: BigInt;
  tradeCount: i32;
  constructor() {
    this.volume = BigInt.fromI32(0);
    this.high = BigInt.fromI32(0);
    this.low = BigInt.fromI32(0);
    this.open = BigInt.fromI32(0);
    this.close = BigInt.fromI32(0);
    this.tradeCount = 0;
  }
}

function aggregateHourBuckets(
  bondingCurve: BondingCurve,
  currentTimestamp: BigInt,
  hours: i32,
): BucketAggregate {
  let result = new BucketAggregate();
  let nowHour = currentTimestamp.div(BigInt.fromI32(3600));
  let firstBucket: BondingCurveHourBucket | null = null;
  let lastBucket: BondingCurveHourBucket | null = null;
  for (let i = hours - 1; i >= 0; i--) {
    let bucketId =
      bondingCurve.id.toHexString() +
      "-" +
      nowHour.minus(BigInt.fromI32(i)).toString();
    let bucket = BondingCurveHourBucket.load(bucketId);
    if (bucket != null) {
      result.volume = result.volume.plus(bucket.volume);
      result.tradeCount += bucket.tradeCount;
      if (
        result.high.equals(BigInt.fromI32(0)) ||
        bucket.high.gt(result.high)
      ) {
        result.high = bucket.high;
      }
      if (result.low.equals(BigInt.fromI32(0)) || bucket.low.lt(result.low)) {
        result.low = bucket.low;
      }
      if (firstBucket == null) {
        firstBucket = bucket;
      }
      lastBucket = bucket;
    }
  }
  if (firstBucket != null) {
    result.open = firstBucket.open;
  }
  if (lastBucket != null) {
    result.close = lastBucket.close;
  }
  return result;
}

function updateBondingCurveStats(
  bondingCurve: BondingCurve,
  ethAmount: BigInt,
  tokenAmount: BigInt,
  isBuy: boolean,
  currentTimestamp: BigInt,
  price: BigInt,
): void {
  bondingCurve.totalVolume = bondingCurve.totalVolume.plus(ethAmount);
  bondingCurve.tradeNonce = bondingCurve.tradeNonce.plus(BigInt.fromI32(1));

  // circulatingSupply 随买卖动态加减
  if (isBuy) {
    bondingCurve.circulatingSupply =
      bondingCurve.circulatingSupply.plus(tokenAmount);
  } else {
    bondingCurve.circulatingSupply =
      bondingCurve.circulatingSupply.minus(tokenAmount);
  }

  bondingCurve.currentPrice = price;

  // 更新历史最高价
  if (
    bondingCurve.allTimeHighPrice.equals(BigInt.fromI32(0)) ||
    price.gt(bondingCurve.allTimeHighPrice)
  ) {
    bondingCurve.allTimeHighPrice = price;
  }

  // 更新历史最低价
  if (
    bondingCurve.allTimeLowPrice.equals(BigInt.fromI32(0)) ||
    price.lt(bondingCurve.allTimeLowPrice)
  ) {
    bondingCurve.allTimeLowPrice = price;
  }

  // 用小时桶聚合统计滑动窗口数据
  let agg24h = aggregateHourBuckets(bondingCurve, currentTimestamp, 24);
  bondingCurve.volume24h = agg24h.volume;
  bondingCurve.priceChange24h = agg24h.close.minus(agg24h.open);
  bondingCurve.highPrice24h = agg24h.high;
  bondingCurve.lowPrice24h = agg24h.low;
  if (!agg24h.open.equals(BigInt.fromI32(0))) {
    bondingCurve.priceChangePercent24h = agg24h.close
      .minus(agg24h.open)
      .times(BigInt.fromI32(1000000))
      .div(agg24h.open);
  }
  let agg7d = aggregateHourBuckets(bondingCurve, currentTimestamp, 168);
  bondingCurve.volume7d = agg7d.volume;
  bondingCurve.priceChange7d = agg7d.close.minus(agg7d.open);
  bondingCurve.highPrice7d = agg7d.high;
  bondingCurve.lowPrice7d = agg7d.low;
  if (!agg7d.open.equals(BigInt.fromI32(0))) {
    bondingCurve.priceChangePercent7d = agg7d.close
      .minus(agg7d.open)
      .times(BigInt.fromI32(1000000))
      .div(agg7d.open);
  }
  bondingCurve.updatedAt = currentTimestamp;
}

function updateHourBucket(
  bondingCurve: BondingCurve,
  currentTimestamp: BigInt,
  price: BigInt,
  tokenAmount: BigInt,
  isBuy: boolean,
): void {
  let hour = currentTimestamp.div(BigInt.fromI32(3600));
  let bucketId = bondingCurve.id.toHexString() + "-" + hour.toString();
  let bucket = BondingCurveHourBucket.load(bucketId);

  // 根据买卖类型决定 volume 的正负，使用 token 数量
  let volumeToAdd = isBuy ? tokenAmount : tokenAmount.neg();

  if (bucket == null) {
    bucket = new BondingCurveHourBucket(bucketId);
    bucket.bondingCurve = bondingCurve.id;
    bucket.hour = hour;
    bucket.startTimestamp = hour.times(BigInt.fromI32(3600));
    bucket.endTimestamp = bucket.startTimestamp.plus(BigInt.fromI32(3599));
    bucket.tradeCount = 1;
    bucket.volume = volumeToAdd;

    // 使用 bondingCurve 中存储的上一个小时桶信息
    let openPrice: BigInt;
    if (bondingCurve.lastHourClosePrice.gt(BigInt.fromI32(0))) {
      openPrice = bondingCurve.lastHourClosePrice;
    } else {
      openPrice = price;
    }

    bucket.open = openPrice;
    bucket.close = price;

    if (price.gt(openPrice)) {
      bucket.high = price;
      bucket.low = openPrice;
    } else {
      bucket.high = openPrice;
      bucket.low = price;
    }
  } else {
    bucket.volume = bucket.volume.plus(volumeToAdd);
    if (price.gt(bucket.high)) bucket.high = price;
    if (price.lt(bucket.low)) bucket.low = price;
    bucket.close = price;
    bucket.tradeCount = bucket.tradeCount + 1;
  }

  // 更新 bondingCurve 的小时桶状态
  bondingCurve.lastHourBucketId = bucketId;
  bondingCurve.lastHourClosePrice = bucket.close;
  bondingCurve.lastHourTradeTimestamp = currentTimestamp;

  bucket.save();
}

function updateMinuteBucket(
  bondingCurve: BondingCurve,
  currentTimestamp: BigInt,
  price: BigInt,
  tokenAmount: BigInt,
  isBuy: boolean,
): void {
  let minute = currentTimestamp.div(BigInt.fromI32(60));
  let bucketId = bondingCurve.id.toHexString() + "-" + minute.toString();
  let bucket = BondingCurveMinuteBucket.load(bucketId);

  let volumeToAdd = isBuy ? tokenAmount : tokenAmount.neg();

  if (bucket == null) {
    bucket = new BondingCurveMinuteBucket(bucketId);
    bucket.bondingCurve = bondingCurve.id;
    bucket.minute = minute;
    bucket.startTimestamp = minute.times(BigInt.fromI32(60));
    bucket.endTimestamp = bucket.startTimestamp.plus(BigInt.fromI32(59));
    bucket.tradeCount = 1;
    bucket.volume = volumeToAdd;
    // 使用 bondingCurve 中存储的上一个分钟桶信息
    let openPrice: BigInt;
    if (bondingCurve.lastMinuteClosePrice.gt(BigInt.fromI32(0))) {
      openPrice = bondingCurve.lastMinuteClosePrice;
    } else {
      openPrice = price;
    }

    bucket.open = openPrice;
    bucket.close = price;

    if (price.gt(openPrice)) {
      bucket.high = price;
      bucket.low = openPrice;
    } else {
      bucket.high = openPrice;
      bucket.low = price;
    }
  } else {
    bucket.volume = bucket.volume.plus(volumeToAdd);
    if (price.gt(bucket.high)) bucket.high = price;
    if (price.lt(bucket.low)) bucket.low = price;
    bucket.close = price;
    bucket.tradeCount = bucket.tradeCount + 1;
  }

  // 更新 bondingCurve 的分钟桶状态
  bondingCurve.lastMinuteBucketId = bucketId;
  bondingCurve.lastMinuteClosePrice = bucket.close;
  bondingCurve.lastMinuteTradeTimestamp = currentTimestamp;

  bucket.save();
}

export function getOrCreateBondingCurve(
  contractAddress: Bytes,
  block: ethereum.Block,
  token: Bytes = Bytes.empty(),
  dev: Bytes = Bytes.empty(),
): BondingCurve {
  let bondingCurve = BondingCurve.load(contractAddress);
  if (bondingCurve == null) {
    bondingCurve = new BondingCurve(contractAddress);
    let contract = bonding_curve.bind(Address.fromBytes(contractAddress));

    // 获取合约数据
    if (!token.equals(Bytes.empty()) && !dev.equals(Bytes.empty())) {
      bondingCurve.token = token;
      bondingCurve.dev = dev;
    } else {
      bondingCurve.token = contract.getToken();
    }
    bondingCurve.totalVolume = BigInt.fromI32(0);

    bondingCurve.tradeNonce = BigInt.fromI32(0);
    bondingCurve.numHolders = BigInt.fromI32(0);

    // 初始化市值相关数据
    bondingCurve.tradeFee = contract.tradeFee();
    bondingCurve.maxSupplyPerWallet = contract.maxSupplyPerWallet();
    bondingCurve.totalSupply = contract.BONDING_TARGET(); // 只初始化一次
    bondingCurve.maxSupply = contract.TOKEN_TOTAL();

    bondingCurve.currentPrice = BigInt.fromI32(0);
    bondingCurve.marketCap = contract.costForward(
      BigInt.fromI32(0),
      bondingCurve.totalSupply,
    ); // bond市值

    // 新增行情字段初始化
    bondingCurve.allTimeHighPrice = BigInt.fromI32(0);
    bondingCurve.allTimeLowPrice = BigInt.fromI32(0);
    bondingCurve.highPrice24h = BigInt.fromI32(0);
    bondingCurve.lowPrice24h = BigInt.fromI32(0);
    bondingCurve.highPrice7d = BigInt.fromI32(0);
    bondingCurve.lowPrice7d = BigInt.fromI32(0);
    bondingCurve.volume24h = BigInt.fromI32(0);
    bondingCurve.volume7d = BigInt.fromI32(0);
    bondingCurve.priceChange24h = BigInt.fromI32(0);
    bondingCurve.priceChangePercent24h = BigInt.fromI32(0);
    bondingCurve.priceChange7d = BigInt.fromI32(0);
    bondingCurve.priceChangePercent7d = BigInt.fromI32(0);
    bondingCurve.circulatingSupply = BigInt.fromI32(0); // 初始为0
    bondingCurve.lastMinuteBucketId = "";
    bondingCurve.lastMinuteClosePrice = BigInt.fromI32(0);
    bondingCurve.lastMinuteTradeTimestamp = BigInt.fromI32(0);
    bondingCurve.lastHourBucketId = "";
    bondingCurve.lastHourClosePrice = BigInt.fromI32(0);
    bondingCurve.lastHourTradeTimestamp = BigInt.fromI32(0);

    bondingCurve.createdAt = block.timestamp;
    bondingCurve.updatedAt = block.timestamp;
    bondingCurve.save();
  }
  return bondingCurve;
}

export function getOrCreateHolder(
  bondingCurve: BondingCurve,
  holderAddress: Bytes,
  block: ethereum.Block,
): Holder {
  let id = bondingCurve.id.concat(holderAddress);
  let holder = Holder.load(id);
  if (holder == null) {
    holder = new Holder(id);
    holder.bondingCurve = bondingCurve.id;
    holder.address = holderAddress;
    holder.balance = BigInt.fromI32(0);
    holder.createdAt = block.timestamp;
    holder.updatedAt = block.timestamp;
    holder.save();

    // 更新持有者数量
    bondingCurve.numHolders = bondingCurve.numHolders.plus(BigInt.fromI32(1));
    bondingCurve.save();
  }
  return holder;
}

export function handleBuy(event: Buy): void {
  let bondingCurve = getOrCreateBondingCurve(event.address, event.block);
  let holder = getOrCreateHolder(bondingCurve, event.params.user, event.block);

  // 计算价格：ETH/Token * 1e18（event.params.quantityETH 是已扣手续费的）
  let price = event.params.quantityETH
    .times(BigInt.fromI32(10).pow(18))
    .div(event.params.quantityTokens);

  // 更新交易记录
  let trade = new BondingCurveTrade(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  );
  trade.bondingCurve = bondingCurve.id;
  trade.type = "Buy";
  trade.ethAmount = event.params.quantityETH;
  trade.tokenAmount = event.params.quantityTokens;
  trade.price = price;
  trade.timestamp = event.block.timestamp;
  trade.sender = event.params.user;
  trade.transactionHash = event.transaction.hash;
  trade.save();

  // 更新持有者余额
  holder.balance = holder.balance.plus(event.params.quantityTokens);
  holder.updatedAt = event.block.timestamp;
  holder.save();

  updateMinuteBucket(
    bondingCurve,
    event.block.timestamp,
    price,
    event.params.quantityTokens,
    true,
  );

  updateHourBucket(
    bondingCurve,
    event.block.timestamp,
    price,
    event.params.quantityTokens,
    true,
  );

  // 更新 bonding curve 统计
  updateBondingCurveStats(
    bondingCurve,
    event.params.quantityETH,
    event.params.quantityTokens,
    true,
    event.block.timestamp,
    price,
  );
  bondingCurve.save();
}

export function handleSell(event: Sell): void {
  let bondingCurve = getOrCreateBondingCurve(event.address, event.block);
  let holder = getOrCreateHolder(bondingCurve, event.params.user, event.block);

  // 更新交易记录
  let trade = new BondingCurveTrade(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  );
  trade.bondingCurve = bondingCurve.id;
  trade.type = "Sell";
  trade.ethAmount = event.params.quantityETH;
  trade.tokenAmount = event.params.quantityTokens;

  // 计算实际到账的 ETH（已扣手续费）
  let tradeFee = bondingCurve.tradeFee;
  let feeDenominator = BigInt.fromI32(1000);
  let actualETH = event.params.quantityETH
    .times(feeDenominator.minus(BigInt.fromI32(tradeFee)))
    .div(feeDenominator);

  // 计算价格：实际到账 ETH/Token * 1e18
  let price = actualETH
    .times(BigInt.fromI32(10).pow(18))
    .div(event.params.quantityTokens);

  trade.price = price;

  trade.timestamp = event.block.timestamp;
  trade.sender = event.params.user;
  trade.transactionHash = event.transaction.hash;
  trade.save();

  // 更新持有者余额
  holder.balance = holder.balance.minus(event.params.quantityTokens);
  holder.updatedAt = event.block.timestamp;

  // 如果余额为 0，减少持有者数量
  if (holder.balance.equals(BigInt.fromI32(0))) {
    bondingCurve.numHolders = bondingCurve.numHolders.minus(BigInt.fromI32(1));
  }

  holder.save();

  updateMinuteBucket(
    bondingCurve,
    event.block.timestamp,
    price,
    event.params.quantityTokens,
    false,
  );

  updateHourBucket(
    bondingCurve,
    event.block.timestamp,
    price,
    event.params.quantityTokens,
    false,
  );

  // 更新 bonding curve 统计
  updateBondingCurveStats(
    bondingCurve,
    event.params.quantityETH,
    event.params.quantityTokens,
    false,
    event.block.timestamp,
    price,
  );

  bondingCurve.save();
}
