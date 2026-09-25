import packageJson from '../package.json';
import { ViewerBridge, type ViewerBridgeOptions } from './ViewerBridge';
import getCustomizationModule from './getCustomizationModule';

type PreRegistrationOptions = Pick<ViewerBridgeOptions, 'commandsManager' | 'servicesManager'> & {
  configuration?: {
    hostOrigin?: string;
  };
};

let bridge: ViewerBridge | null = null;
let bridgeOptions: ViewerBridgeOptions | null = null;

const viewerBridgeExtension = {
  id: packageJson.name,

  getCustomizationModule,

  preRegistration({
    commandsManager,
    servicesManager,
    configuration = {},
  }: PreRegistrationOptions) {
    const hostOrigin = configuration.hostOrigin ?? process.env.HOST_ORIGIN;

    if (!hostOrigin) {
      throw new Error('[ViewerBridge] HOST_ORIGIN is required');
    }

    bridgeOptions = {
      commandsManager,
      servicesManager,
      hostOrigin,
    };
  },

  onModeEnter() {
    if (!bridge && bridgeOptions) {
      bridge = new ViewerBridge(bridgeOptions);
    }
  },

  onModeExit() {
    bridge?.destroy();
    bridge = null;
  },
};

export default viewerBridgeExtension;
