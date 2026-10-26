import { createActionGenerator } from "@store/utils/utils.actions";
import { ConfigurationState } from "@modules/configuration/configuration.types";
import type { UpdateStatus } from "@shared/types/update.types";
import type { OidcAuthStatus } from "@shared/types/auth.types";
import type { SettingsSectionKey } from "@components/frame/settings/Settings";

const createAction = createActionGenerator("configuration");

export const setSystemInformation = createAction<Required<ConfigurationState["system"]>>("info/set");
export const setUpdateStatus = createAction<UpdateStatus>("update/set");
export const setAuthStatuses = createAction<OidcAuthStatus[]>("auth-statuses/set");
export const openSettings = createAction<SettingsSectionKey | undefined>("settings/open");
export const closeSettings = createAction("settings/close");
