import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll,
} from "matchstick-as";
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { Bonded } from "../generated/schema";
import { Bonded as BondedEvent } from "../generated/enjoy-pump-fun-database-bsc-test/enjoy-pump-fun-database-bsc-test";
import { handleBonded } from "../src/enjoy-pump-fun-database-bsc-test";
import { createBondedEvent } from "./enjoy-pump-fun-database-bsc-test-utils";

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#tests-structure

describe("Describe entity assertions", () => {
  beforeAll(() => {
    let token = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    );
    let newBondedEvent = createBondedEvent(token);
    handleBonded(newBondedEvent);
  });

  afterAll(() => {
    clearStore();
  });

  // For more test scenarios, see:
  // https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#write-a-unit-test

  test("Bonded created and stored", () => {
    assert.entityCount("Bonded", 1);

    // 0xa16081f360e3847006db660bae1c6d1b2e17ec2a is the default address used in newMockEvent() function
    assert.fieldEquals(
      "Bonded",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "token",
      "0x0000000000000000000000000000000000000001"
    );

    // More assert options:
    // https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#asserts
  });
});
