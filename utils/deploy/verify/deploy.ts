import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { artifacts, ethers } from "hardhat";
import type { AutoApprove, CloneFactory, Verify } from "../../../typechain";
import { NewCloneEvent } from "../../../typechain/contracts/factory/CloneFactory";
import { VerifyConfigStruct } from "../../../typechain/contracts/verify/Verify";
import { ImplementationEvent as ImplementationEventVerifyFactory } from "../../../typechain/contracts/verify/VerifyFactory";
import { zeroAddress } from "../../constants";
import { getEventArgs } from "../../events";


export const verifyImplementation = async (): Promise<Verify>  => {
  const verifyFactory = await ethers.getContractFactory("Verify");
  const verifyImplementation = (await verifyFactory.deploy()) as Verify;
  await verifyImplementation.deployed();

  
  assert(
    !(verifyImplementation.address === zeroAddress),
    "verify implementation zero address"
  );

  return verifyImplementation;
}; 

export const verifyCloneDeploy = async (
    cloneFactory: CloneFactory ,
    implementVerify: Verify ,
    admin: string,
    callback: string
): Promise<Verify>  => {
  const verifyConfig: VerifyConfigStruct = {
    admin: admin,
    callback: callback
  } 

  const encodedConfig = ethers.utils.defaultAbiCoder.encode(
    [
      "tuple(address admin , address callback )",
    ],
    [verifyConfig]
  );   

  const verifyClone = await cloneFactory.clone(implementVerify.address ,encodedConfig )    
  
  const cloneEvent = (await getEventArgs(
    verifyClone,
    "NewClone",
    cloneFactory
  )) as NewCloneEvent["args"]; 

  assert(
    !(cloneEvent.clone === zeroAddress),
    "Clone Verify zero address"
  );

  const verify = (await ethers.getContractAt('Verify',cloneEvent.clone)) as Verify  

  return verify

};

// export const verifyFactoryDeploy = async () => {
//   const verifyFactoryFactory = await ethers.getContractFactory("VerifyFactory");
//   const verifyFactory = (await verifyFactoryFactory.deploy()) as VerifyFactory;
//   await verifyFactory.deployed();

//   const { implementation } = (await getEventArgs(
//     verifyFactory.deployTransaction,
//     "Implementation",
//     verifyFactory
//   )) as ImplementationEventVerifyFactory["args"];
//   assert(
//     !(implementation === zeroAddress),
//     "implementation verify factory zero address"
//   );

//   return verifyFactory;
// };

// export const verifyDeploy = async (
//   deployer: SignerWithAddress,
//   verifyFactory: VerifyFactory,
//   config: VerifyConfigStruct
// ) => {
//   const { implementation } = (await getEventArgs(
//     verifyFactory.deployTransaction,
//     "Implementation",
//     verifyFactory
//   )) as ImplementationEventVerifyFactory["args"];
//   assert(
//     !(implementation === zeroAddress),
//     "implementation verify factory zero address"
//   );

//   const tx = await verifyFactory.createChildTyped(config);
//   const verify = new ethers.Contract(
//     ethers.utils.hexZeroPad(
//       ethers.utils.hexStripZeros(
//         (await getEventArgs(tx, "NewChild", verifyFactory)).child
//       ),
//       20
//     ),
//     (await artifacts.readArtifact("Verify")).abi,
//     deployer
//   ) as Verify;
//   await verify.deployed();

//   // eslint-disable-next-line @typescript-eslint/ban-ts-comment
//   // @ts-ignore
//   verify.deployTransaction = tx;
//   return verify;
// };
