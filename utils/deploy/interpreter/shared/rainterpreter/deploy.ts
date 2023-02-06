import {
  Rainterpreter,
  RainterpreterExtern,
  RainterpreterStore,
} from "../../../../../typechain";
import { getRainterpreterOpmetaBytes } from "../../../../meta/op/allStandardOpmeta";
import { basicDeploy } from "../../../basicDeploy";

export const rainterpreterDeploy = async () => {
  const store = (await basicDeploy(
    "RainterpreterStore",
    {}
  )) as RainterpreterStore;
  return (await basicDeploy("Rainterpreter", {}, [
    {
      store: store.address,
      opMeta: getRainterpreterOpmetaBytes(),
    },
  ])) as Rainterpreter;
};

export const rainterpreterStoreDeploy = async () => {
  return (await basicDeploy("RainterpreterStore", {})) as RainterpreterStore;
};

export const rainterpreterExtern = async () => {
  return (await basicDeploy("RainterpreterExtern", {})) as RainterpreterExtern;
};
