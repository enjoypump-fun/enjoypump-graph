import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt, Bytes } from "@graphprotocol/graph-ts"
import {
  Bonded,
  NewTokenCreated,
  OwnerSet
} from "../generated/enjoy-pump-fun-database-bsc-test/enjoy-pump-fun-database-bsc-test"

export function createBondedEvent(token: Address): Bonded {
  let bondedEvent = changetype<Bonded>(newMockEvent())

  bondedEvent.parameters = new Array()

  bondedEvent.parameters.push(
    new ethereum.EventParam("token", ethereum.Value.fromAddress(token))
  )

  return bondedEvent
}

export function createNewTokenCreatedEvent(
  dev: Address,
  token: Address,
  bondingCurve: Address,
  nonce: BigInt,
  projectData: Bytes
): NewTokenCreated {
  let newTokenCreatedEvent = changetype<NewTokenCreated>(newMockEvent())

  newTokenCreatedEvent.parameters = new Array()

  newTokenCreatedEvent.parameters.push(
    new ethereum.EventParam("dev", ethereum.Value.fromAddress(dev))
  )
  newTokenCreatedEvent.parameters.push(
    new ethereum.EventParam("token", ethereum.Value.fromAddress(token))
  )
  newTokenCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "bondingCurve",
      ethereum.Value.fromAddress(bondingCurve)
    )
  )
  newTokenCreatedEvent.parameters.push(
    new ethereum.EventParam("nonce", ethereum.Value.fromUnsignedBigInt(nonce))
  )
  newTokenCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "projectData",
      ethereum.Value.fromBytes(projectData)
    )
  )

  return newTokenCreatedEvent
}

export function createOwnerSetEvent(
  oldOwner: Address,
  newOwner: Address
): OwnerSet {
  let ownerSetEvent = changetype<OwnerSet>(newMockEvent())

  ownerSetEvent.parameters = new Array()

  ownerSetEvent.parameters.push(
    new ethereum.EventParam("oldOwner", ethereum.Value.fromAddress(oldOwner))
  )
  ownerSetEvent.parameters.push(
    new ethereum.EventParam("newOwner", ethereum.Value.fromAddress(newOwner))
  )

  return ownerSetEvent
}
