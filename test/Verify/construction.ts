import { assert } from "chai";
import { ethers } from "hardhat";
import type { CloneFactory, Verify } from "../../typechain";
import { NewCloneEvent } from "../../typechain/contracts/factory/CloneFactory";

import { InitializeEvent, VerifyConfigStruct } from "../../typechain/contracts/verify/Verify";
import { basicDeploy, zeroAddress } from "../../utils";
import {
  APPROVER,
  APPROVER_ADMIN,
  BANNER,
  BANNER_ADMIN,
  REMOVER,
  REMOVER_ADMIN,
} from "../../utils/constants/verify";
import { verifyImplementation  } from "../../utils/deploy/verify/deploy";
import { getEventArgs } from "../../utils/events";
import { compareStructs } from "../../utils/test/compareStructs"; 


describe("Verify construction", async function () {
  let implementVerify: Verify
  let cloneFactory: CloneFactory

  before(async () => {
    implementVerify = await verifyImplementation()

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory",{})) as CloneFactory
  });

  it("should construct and initialize correctly", async function () {
    const signers = await ethers.getSigners();
    const defaultAdmin = signers[0];

    const verifyConfig: VerifyConfigStruct = {
      admin: defaultAdmin.address,
      callback: ethers.constants.AddressZero,
    };

  
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

    assert(
      (await verify.APPROVER_ADMIN()) === APPROVER_ADMIN,
      "wrong APPROVER_ADMIN hash value"
    );
    assert((await verify.APPROVER()) === APPROVER, "wrong APPROVER hash value");

    assert(
      (await verify.REMOVER_ADMIN()) === REMOVER_ADMIN,
      "wrong REMOVER_ADMIN hash value"
    );
    assert((await verify.REMOVER()) === REMOVER, "wrong REMOVER hash value");

    assert(
      (await verify.BANNER_ADMIN()) === BANNER_ADMIN,
      "wrong BANNER_ADMIN hash value"
    );
    assert((await verify.BANNER()) === BANNER, "wrong BANNER hash value");

    const callback = await verify.callback();
    assert(callback === verifyConfig.callback, "wrong callback address");

    const { sender, config } = (await getEventArgs(
      verifyClone,
      "Initialize",
      verify
    )) as InitializeEvent["args"];

    assert(
      sender === cloneFactory.address,
      "wrong sender in Initialize event"
    );
    compareStructs(config, verifyConfig);
  });
});
