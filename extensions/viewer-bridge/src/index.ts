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

function createBridge() {
  if (!bridge && bridgeOptions) {
    bridge = new ViewerBridge(bridgeOptions);
  }
}

const viewerBridgeExtension = {
  id: packageJson.name,
  getCustomizationModule,

  preRegistration({
    commandsManager,
    servicesManager,
    configuration = {},
  }: PreRegistrationOptions) {
    const { hostOrigin = process.env.HOST_ORIGIN } = configuration;

    if (!hostOrigin) {
      throw new Error('[ViewerBridge] HOST_ORIGIN is required');
    }

    bridge?.destroy();
    bridgeOptions = { commandsManager, servicesManager, hostOrigin };
    bridge = new ViewerBridge(bridgeOptions);
  },
  onModeEnter: createBridge,
  onModeExit() {
    bridge?.destroy();
    bridge = null;
  },
};

export default viewerBridgeExtension;
