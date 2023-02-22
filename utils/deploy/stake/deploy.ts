import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Overrides } from "ethers"; 
import { assert } from "chai";
import { artifacts, ethers } from "hardhat";
import { CloneFactory, RainterpreterExpressionDeployer, Stake, StakeFactory } from "../../../typechain";
import { NewCloneEvent } from "../../../typechain/contracts/factory/CloneFactory";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../../typechain/contracts/flow/FlowCommon";
import { StakeConfigStruct } from "../../../typechain/contracts/stake/Stake";
import { zeroAddress } from "../../constants";
import { getEventArgs } from "../../events";
import { getRainContractMetaBytes } from "../../meta";
import { getTouchDeployer } from "../interpreter/shared/rainterpreterExpressionDeployer/deploy";
 


export const stakeImplementation = async (): Promise<Stake> => {
  const stakeFactory = await ethers.getContractFactory("Stake", {}); 

  const touchDeployer: RainterpreterExpressionDeployer = await getTouchDeployer();
  const interpreterCallerConfig: InterpreterCallerV1ConstructionConfigStruct = {
    callerMeta: getRainContractMetaBytes("stake"),
    deployer: touchDeployer.address,
  };

  const stake = (await stakeFactory.deploy(interpreterCallerConfig)) as Stake; 

  assert(
    !(stake.address === zeroAddress),
    "implementation stake zero address"
  );

  return stake;
};  

export const stakeCloneDeploy = async (
  cloneFactory: CloneFactory ,
  stakeImplementation: Stake ,
  initialConfig: StakeConfigStruct
): Promise<Stake> => { 

  const encodedConfig = ethers.utils.defaultAbiCoder.encode(
    [
      "tuple(address asset ,string name, string symbol , tuple(address deployer,bytes[] sources,uint256[] constants) evaluableConfig)",
    ],
    [initialConfig]
  );  

  const stakeClone = await cloneFactory.clone(stakeImplementation.address ,encodedConfig )   

  const cloneEvent = (await getEventArgs(
    stakeClone,
      "NewClone",
      cloneFactory
    )) as NewCloneEvent["args"]; 

    assert(
      !(cloneEvent.clone === zeroAddress),
      "stake clone zero address"
    );
  
  const stake = (await ethers.getContractAt('Stake',cloneEvent.clone)) as Stake   

  return stake
}; 



// export const stakeDeploy = async (
//   deployer: SignerWithAddress,
//   stakeFactory: StakeFactory,
//   stakeConfigStruct: StakeConfigStruct,
//   ...args: Overrides[]
// ): Promise<Stake> => {
//   const txDeploy = await stakeFactory.createChildTyped(
//     stakeConfigStruct,
//     ...args
//   );

//   const stake = new ethers.Contract(
//     ethers.utils.hexZeroPad(
//       ethers.utils.hexStripZeros(
//         (await getEventArgs(txDeploy, "NewChild", stakeFactory)).child
//       ),
//       20 // address bytes length
//     ),
//     (await artifacts.readArtifact("Stake")).abi,
//     deployer
//   ) as Stake;

//   await stake.deployed();

//   // eslint-disable-next-line @typescript-eslint/ban-ts-comment
//   // @ts-ignore
//   stake.deployTransaction = txDeploy;

//   return stake;
// };
