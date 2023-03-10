import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge'

import * as broadlink from 'node-broadlink'
import { S3 } from 'node-broadlink/dist/hub'
import { LC1Switch } from './LC1Switch'

import { PLATFORM_NAME, PLUGIN_NAME } from './settings'

export class BroadlinkPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service
  public readonly Characteristic: typeof Characteristic =
    this.api.hap.Characteristic

  public readonly accessories: PlatformAccessory[] = []

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name)

    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback')
      this.discoverDevices()
    })
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName)
    this.accessories.push(accessory)
  }

  async discoverDevices() {
    const devices = await broadlink.discover()
    for (const device of devices) {
      if (device.deviceType === 42573) {
        const hub = device as S3
        await hub.auth()
        const subdevices = await hub.getSubDevices()

        subdevices.forEach(async (subdevice, index) => {
          const { host } = hub
          // @ts-expect-error: getSubDevices returns wrong type
          const uniqueId = subdevice.did
          // @ts-expect-error: getSubDevices returns wrong type
          const deviceName = subdevice.name
          const status = await hub.getState(uniqueId)

          const uuid = this.api.hap.uuid.generate(uniqueId)

          const existingAccessory = this.accessories.find(
            accessory => accessory.UUID === uuid,
          )

          if (existingAccessory) {
            // the accessory already exists
            this.log.info(
              'Restoring existing accessory from cache:',
              existingAccessory.displayName,
            )

            new LC1Switch(this, existingAccessory)
          } else {
            this.log.info('Adding new accessory:', deviceName)

            const gangs = [status.pwr1, status.pwr2, status.pwr3].filter(
              v => v !== void 0,
            ).length

            const accessory = new this.api.platformAccessory(
              `#${index} LC1 ${gangs} Gang Switch`,
              uuid,
            )

            accessory.context.device = {
              uniqueId,
              host,
              deviceName,
              status,
              gangs,
            }

            new LC1Switch(this, accessory)

            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
              accessory,
            ])
          }
        })
      }
    }
  }
}
