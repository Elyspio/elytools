import { createActionGenerator } from "@store/utils/utils.actions";
import { ConfigurationState } from "@modules/configuration/configuration.types";
import type { UpdateStatus } from "@shared/types/update.types";

const createAction = createActionGenerator("configuration");

export const setSystemInformation = createAction<Required<ConfigurationState["system"]>>("info/set");
export const setUpdateStatus = createAction<UpdateStatus>("update/set");
