import { createActionGenerator } from "@store/utils/utils.actions";
import { ConfigurationState } from "@modules/configuration/configuration.types";

const createAction = createActionGenerator("configuration");

export const setSystemInformation = createAction<Required<ConfigurationState["system"]>>("info/set");
