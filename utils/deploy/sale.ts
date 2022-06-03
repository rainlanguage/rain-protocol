import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract, Overrides } from "ethers";
import { artifacts, ethers } from "hardhat";
import { RedeemableERC20 } from "../../typechain/RedeemableERC20";
import {
  Sale,
  SaleConfigStruct,
  SaleRedeemableERC20ConfigStruct,
} from "../../typechain/Sale";
import { SaleFactory } from "../../typechain/SaleFactory";
import { getEventArgs } from "../events";

export const saleDeploy = async (
  signers: SignerWithAddress[],
  deployer: SignerWithAddress,
  saleFactory: SaleFactory & Contract,
  config: SaleConfigStruct,
  saleRedeemableERC20Config: SaleRedeemableERC20ConfigStruct,
  ...args: Overrides[]
): Promise<[Sale & Contract, RedeemableERC20 & Contract]> => {
  const txDeploy = await saleFactory.createChildTyped(
    config,
    saleRedeemableERC20Config,
    ...args
  );

  const sale = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(txDeploy, "NewChild", saleFactory)).child
      ),
      20 // address bytes length
    ),
    (await artifacts.readArtifact("Sale")).abi,
    deployer
  ) as Sale & Contract;

  if (!ethers.utils.isAddress(sale.address)) {
    throw new Error(
      `invalid sale address: ${sale.address} (${sale.address.length} chars)`
    );
  }

  await sale.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  sale.deployTransaction = txDeploy;

  let token = new ethers.Contract(
    await sale.token(),
    (await artifacts.readArtifact("RedeemableERC20")).abi
  ) as RedeemableERC20 & Contract;

  token = token.connect(signers[0]); // need to do this for some reason

  return [sale, token];
};
