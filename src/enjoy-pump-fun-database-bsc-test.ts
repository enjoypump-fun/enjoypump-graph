import {
  Bonded as BondedEvent,
  NewTokenCreated as NewTokenCreatedEvent,
  OwnerSet as OwnerSetEvent,
} from "../generated/enjoy-pump-fun-database-bsc-test/enjoy_pump_fun_database_bsc_test";
import { Bonded, NewTokenCreated, OwnerSet, BondingCurve } from "../generated/schema";
import { getOrCreateBondingCurve } from "./bonding-curve";
import { bonding_curve as BondingCurveTemplate } from "../generated/templates";

function createBonded(event: BondedEvent): Bonded {
  let entity = new Bonded(event.params.token);
  entity.token = event.params.token;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  return entity;
}

function createNewTokenCreated(
  event: NewTokenCreatedEvent,
  bondingCurve: BondingCurve
): NewTokenCreated {
  let entity = new NewTokenCreated(event.params.bondingCurve);
  entity.bondingCurve = bondingCurve.id;
  entity.token = event.params.token;
  entity.dev = event.params.dev;
  entity.projectData = event.params.projectData;
  entity.nonce = event.params.nonce;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  entity.bondingCurveInfo = bondingCurve.id;
  return entity;
}

function createOwnerSet(event: OwnerSetEvent): OwnerSet {
  let entity = new OwnerSet(event.params.newOwner);
  entity.oldOwner = event.params.oldOwner;
  entity.newOwner = event.params.newOwner;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;
  return entity;
}

export function handleBonded(event: BondedEvent): void {
  createBonded(event).save();
}

export function handleNewTokenCreated(event: NewTokenCreatedEvent): void {
  let bondingCurve = getOrCreateBondingCurve(
    event.params.bondingCurve,
    event.block,
    event.params.token,
    event.params.dev
  );
  createNewTokenCreated(event, bondingCurve).save();
  BondingCurveTemplate.create(event.params.bondingCurve);
}

export function handleOwnerSet(event: OwnerSetEvent): void {
  createOwnerSet(event).save();
}
