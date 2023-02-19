import {
  Rainterpreter,
  RainterpreterExtern,
  RainterpreterStore,
} from "../../../../../typechain";
import { basicDeploy } from "../../../basicDeploy";

export const rainterpreterDeploy = async () => {
  return (await basicDeploy("Rainterpreter", {})) as Rainterpreter;
};

export const rainterpreterStoreDeploy = async () => {
  return (await basicDeploy("RainterpreterStore", {})) as RainterpreterStore;
};

export const rainterpreterExtern = async () => {
  return (await basicDeploy("RainterpreterExtern", {})) as RainterpreterExtern;
};
