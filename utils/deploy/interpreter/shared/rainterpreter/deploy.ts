import { Rainterpreter, RainterpreterStore } from "../../../../../typechain";
import { basicDeploy } from "../../../basicDeploy";

export const rainterpreterDeploy = async () => {
  const store = (await basicDeploy(
    "RainterpreterStore",
    {}
  )) as RainterpreterStore;
  return (await basicDeploy("Rainterpreter", {}, [
    {
      store: store.address,
      opMeta: [],
    },
  ])) as Rainterpreter;
};

export const rainterpreterStoreDeploy = async () => {
  return (await basicDeploy("RainterpreterStore", {})) as RainterpreterStore;
};
