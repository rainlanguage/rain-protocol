import { RainterpreterV1 } from "../../../../../typechain";
import { basicDeploy } from "../../../basicDeploy";

export const rainterpreterV1Deploy = async () =>
  (await basicDeploy("RainterpreterV1", {})) as RainterpreterV1;
