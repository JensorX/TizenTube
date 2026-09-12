import { getGuide } from '../utils/innerTubeCalls.js';
import { configRead, configWrite } from '../config.js';
import { buttonItem, overlayPanelItemListRenderer, showModal } from './ytUI.js';
import { t } from 'i18next';

function showSetting(settingType, parameters) {
    if (settingType === 'MOVE_GUIDE_BUTTON') {
        const order = configRead('sidebarContentsOrder');
        const browseId = parameters.item.guideEntryRenderer.navigationEndpoint?.browseEndpoint?.browseId
            || (parameters.item.guideEntryRenderer.navigationEndpoint?.searchEndpoint && 'search');
        const index = order.findIndex(item => (typeof item === 'object' && item !== null ? item.browseId : item) === browseId);

        if (index === -1) return showSetting('', true);

        if (parameters.direction === 'up' && index > 0) {
            [order[index - 1], order[index]] = [order[index], order[index - 1]];
        } else if (parameters.direction === 'down' && index < order.length - 1) {
            [order[index + 1], order[index]] = [order[index], order[index + 1]];
        }
        configWrite('sidebarContentsOrder', order);
        return showSetting('', true);
    }

    if (settingType === 'SHOW_GUIDE_BUTTONS') {
        const title = parameters.item.guideEntryRenderer.formattedTitle.simpleText;
        const commands = direction => [{
            customAction: {
                action: 'MOVE_GUIDE_BUTTON',
                parameters: { settingType, direction, item: parameters.item }
            }
        }, { signalAction: { signal: 'POPUP_BACK' } }];

        return showModal(
            title,
            overlayPanelItemListRenderer([
                buttonItem({
                    title: t('settings.options.uiSettings.options.sortSidebarContents.moveUp.title'),
                    subtitle: t('settings.options.uiSettings.options.sortSidebarContents.moveUp.subtitle')
                }, { icon: 'UP_ARROW' }, commands('up')),
                buttonItem({
                    title: t('settings.options.uiSettings.options.sortSidebarContents.moveDown.title'),
                    subtitle: t('settings.options.uiSettings.options.sortSidebarContents.moveDown.subtitle')
                }, { icon: 'DOWN_ARROW' }, commands('down'))
            ]),
            'tt-move-guide-button-modal'
        );
    }

    getGuide().then(guide => {
        const guideItems = guide?.items?.[0]?.guideSectionRenderer?.originalItems
            || guide?.items?.[0]?.guideSectionRenderer?.items
            || [];
        const buttons = guideItems.map((item, index) => {
            const entry = item.guideEntryRenderer;
            const browseId = entry.navigationEndpoint?.browseEndpoint?.browseId
                || (entry.navigationEndpoint?.searchEndpoint && 'search');
            return buttonItem(
                { title: entry.formattedTitle.simpleText },
                {
                    icon: entry.icon?.iconType,
                    secondaryIcon: settingType === 'disabledSidebarContents'
                        ? configRead(settingType)?.includes(browseId) ? 'CHECK_BOX' : 'CHECK_BOX_OUTLINE_BLANK'
                        : null
                },
                settingType === 'disabledSidebarContents'
                    ? [
                        {
                            setClientSettingEndpoint: {
                                settingDatas: [{
                                    clientSettingEnum: { item: 'disabledSidebarContents' },
                                    arrayValue: browseId
                                }]
                            }
                        },
                        { customAction: { action: 'RELOAD_GUIDE_OPTIONS', parameters: { settingType, index, item } } }
                    ]
                    : [{ customAction: { action: 'SHOW_GUIDE_BUTTONS', parameters: { settingType, index, item } } }]
            );
        });

        showModal(
            {
                title: settingType === 'disabledSidebarContents'
                    ? t('settings.options.uiSettings.options.disableSidebarContents.title')
                    : t('settings.options.uiSettings.options.sortSidebarContents.title'),
                subtitle: settingType === 'disabledSidebarContents'
                    ? t('settings.options.uiSettings.options.disableSidebarContents.subtitle')
                    : t('settings.options.uiSettings.options.sortSidebarContents.subtitle')
            },
            overlayPanelItemListRenderer(buttons),
            'tt-sidebar-settings',
            parameters === true
        );
    });
}

export default showSetting;