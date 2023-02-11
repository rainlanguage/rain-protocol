import {
  Rainterpreter,
  RainterpreterExtern,
  RainterpreterStore,
} from "../../../../../typechain";
import { getRainterpreterOpMetaBytes } from "../../../../meta/op/allStandardOpMeta";
import { basicDeploy } from "../../../basicDeploy";

export const rainterpreterDeploy = async () => {
  const store = (await basicDeploy(
    "RainterpreterStore",
    {}
  )) as RainterpreterStore;
  return (await basicDeploy("Rainterpreter", {}, [
    {
      store: store.address,
      opMeta: getRainterpreterOpMetaBytes(),
    },
  ])) as Rainterpreter;
};

export const rainterpreterStoreDeploy = async () => {
  return (await basicDeploy("RainterpreterStore", {})) as RainterpreterStore;
};

export const rainterpreterExtern = async () => {
  return (await basicDeploy("RainterpreterExtern", {})) as RainterpreterExtern;
};
