import { ethers } from "hardhat";
import { NoticeBoard } from "../../../typechain/contracts/noticeboard/";

export const noticeboardDeploy = async () => {
  const noticeboardFactory = await ethers.getContractFactory("NoticeBoard");
  const noticeboard = (await noticeboardFactory.deploy()) as NoticeBoard;
  await noticeboard.deployed();
  return noticeboard;
};
