const ohifVersion = process.env.OHIF_VERSION;

export default function getCustomizationModule() {
  return [
    {
      name: 'global',
      value: {
        'viewportOverlay.bottomRight': {
          $set: [
            {
              id: 'InstanceNumber',
              inheritsFrom: 'ohif.overlayItem.instanceNumber',
            },
            {
              id: 'OhifVersion',
              inheritsFrom: 'ohif.overlayItem',
              contentF: () => `OHIF ${ohifVersion}`,
            },
          ],
        },
      },
    },
  ];
}
