import { ReserveToken } from "../../../../typechain/contracts/test/testToken/ReserveToken";
import { basicDeploy } from "../../basicDeploy";

export const reserveDeploy = async () => {
  const reserve = (await basicDeploy("ReserveToken", {})) as ReserveToken;
  await reserve.initialize();
  return reserve;
};
