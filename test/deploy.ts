import { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import type { ReserveToken } from "../typechain/ReserveToken"
// import type { AToken } from "../typechain/AToken"
import type { BFactory } from "../typechain/BFactory"
import type { BalancerSafeMathMockInterface } from "../typechain/BalancerSafeMathMock"
import type { CRPFactory } from "../typechain/CRPFactory"
chai.use(solidity);
const { expect } = chai;

// describe("Deploy", () => {
//   it("should deploy", async() => {
//     const signers = await ethers.getSigners();

//     const reserveTokenFactory = await ethers.getContractFactory(
//       "ReserveToken",
//       signers[0],
//     );

//     const reserveToken = (await reserveTokenFactory.deploy()) as ReserveToken

//     const aTokenFactory = await ethers.getContractFactory(
//       "AToken",
//       signers[0],
//     )

//     const aToken = (await aTokenFactory.deploy()) as AToken

//     const bFactoryFactory = await ethers.getContractFactory(
//       "BFactory",
//       signers[0]
//     )

//     const bFactory = (await bFactoryFactory.deploy()) as BFactory

//     const balancerSafeMathFactory = await ethers.getContractFactory(
//       "BalancerSafeMath",
//       signers[0]
//     )

//     // const balancerSafeMath = (await balancerSafeMathFactory.deploy()) as BalancerSafeMathInterface

//     // console.log(balancerSafeMathMock)

//     // const crpFactoryFactory = await ethers.getContractFactory(
//     //   "CRPFactory",
//     //   signers[0]
//     // )

//     // const crpFactory = (await crpFactoryFactory.deploy()) as CRPFactory

//     // console.log(crpFactory)

//     // console.log(bFactory)

//     // console.log(reserveToken)

//   })


  // console.log(reserveTokenFactory)

  // console.log(signers)
  // let counter: Counter;
  // beforeEach(async () => {
  //   // 1
  //   const signers = await ethers.getSigners();
  //   // 2
  //   const counterFactory = await ethers.getContractFactory(
  //     "Counter",
  //     signers[0]
  //   );
  //   counter = (await counterFactory.deploy()) as Counter;
  //   await counter.deployed();
  //   const initialCount = await counter.getCount();
  //   // 3
  //   expect(initialCount).to.eq(0);
  //   expect(counter.address).to.properAddress;
  // });
  // // 4
  // describe("count up", async () => {
  //   it("should count up", async () => {
  //     await counter.countUp();
  //     let count = await counter.getCount();
  //     expect(count).to.eq(1);
  //   });
  // });
  // describe("count down", async () => {
  //   // 5
  //   it("should fail", async () => {
  //     // this test will fail
  //     await counter.countDown();
  //   });
  //   it("should count down", async () => {
  //     await counter.countUp();
  //   await counter.countDown();
  //     const count = await counter.getCount();
  //     expect(count).to.eq(0);
  //   });
  // });
// });
