import { ethers } from "hardhat";

export const smartPoolManagerAddress = process.env.BALANCER_SMART_POOL_MANAGER;
if (smartPoolManagerAddress) {
  console.log(`using existing SmartPoolManager: ${smartPoolManagerAddress}`);
}
export const balancerSafeMathAddress = process.env.BALANCER_SAFE_MATH;
if (balancerSafeMathAddress) {
  console.log(`using existing BalancerSafeMath: ${balancerSafeMathAddress}`);
}
export const rightsManagerAddress = process.env.BALANCER_RIGHTS_MANAGER;
if (rightsManagerAddress) {
  console.log(`using existing RightsManager: ${rightsManagerAddress}`);
}
export const bFactoryAddress = process.env.BALANCER_BFACTORY;
if (bFactoryAddress) {
  console.log(`using existing BFactory: ${bFactoryAddress}`);
}
export const crpFactoryAddress = process.env.BALANCER_CRP_FACTORY;
if (crpFactoryAddress) {
  console.log(`using existing CRPFactory: ${crpFactoryAddress}`);
}

export const zeroAddress = ethers.constants.AddressZero;
export const oneAddress = "0x0000000000000000000000000000000000000001";
export const eighteenZeros = "000000000000000000";

export const fourZeros = "0000";
export const sixZeros = "000000";
export const nineZeros = "000000000";
export const tenZeros = "0000000000";
export const sixteenZeros = "0000000000000000";

export const ONE = ethers.BigNumber.from("1" + eighteenZeros);
export const RESERVE_ONE = ethers.BigNumber.from("1" + sixZeros);

export const max_uint256 = ethers.BigNumber.from(
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
);
export const max_uint32 = ethers.BigNumber.from("0xffffffff");
export const max_uint16 = ethers.BigNumber.from("0xffff");
