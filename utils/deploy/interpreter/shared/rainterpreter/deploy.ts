import { Rainterpreter } from "../../../../../typechain";
import { basicDeploy } from "../../../basicDeploy";

export const rainterpreterDeploy = async () =>
  (await basicDeploy("Rainterpreter", {})) as Rainterpreter;
