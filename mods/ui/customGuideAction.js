import { configChangeEmitter, configRead, configWrite } from "../config.js";
import getCommandExecutor from "./customCommandExecution.js";
import { GuideEntryRenderer } from "./ytUI.js";

const origParse = JSON.parse;
JSON.parse = function () {
    const r = origParse.apply(this, arguments);

    const guideSection = r.items?.[0]?.guideSectionRenderer;
    const order = configRead('sidebarContentsOrder');
    if (guideSection && Array.isArray(order)) {
        let orderChanged = false;
        for (const item of guideSection.items) {
            const itemOrder = item.guideEntryRenderer.navigationEndpoint?.browseEndpoint?.browseId
                || (item.guideEntryRenderer.navigationEndpoint?.searchEndpoint && 'search');
            if (itemOrder && !order.some(orderItem => (typeof orderItem === 'object' ? orderItem.browseId : orderItem) === itemOrder)) {
                order.push(itemOrder);
                orderChanged = true;
            }
        }
        if (orderChanged) configWrite('sidebarContentsOrder', order);
    }

    if (configRead('sidebarContentsOrder')?.length === 0 && guideSection) {
        configWrite('sidebarContentsOrder', guideSection.items.map(item => {
            const endpoint = item.guideEntryRenderer.navigationEndpoint;
            return endpoint?.browseEndpoint?.browseId || (endpoint?.searchEndpoint && 'search');
        }).filter(Boolean));
    } else if (guideSection) {
        const copiedItems = JSON.parse(JSON.stringify(guideSection.items));
        for (const orderItem of order) {
            if (typeof orderItem === 'object' && orderItem !== null) {
                copiedItems.push(GuideEntryRenderer(orderItem.title, {
                    browseEndpoint: { browseId: orderItem.browseId }
                }, 'PERSON'));
            }
        }

        guideSection.items = order.map(orderItem => {
            const browseId = typeof orderItem === 'object' ? orderItem.browseId : orderItem;
            return copiedItems.find(item => {
                const endpoint = item.guideEntryRenderer.navigationEndpoint;
                return endpoint?.browseEndpoint?.browseId === browseId
                    || (browseId === 'search' && endpoint?.searchEndpoint);
            });
        }).filter(Boolean);
    }

    const disabledSidebarContents = configRead('disabledSidebarContents');
    const disableChannelsOnSidebar = configRead('disableChannelsOnSidebar');
    if (r.items && Array.isArray(r.items) && r.items[0]?.guideSectionRenderer) {
        for (const item of r.items) {
            const section = item.guideSectionRenderer;
            section.originalItems = section.items.slice();
            for (let j = 0; j < section.items.length; j++) {
                const guideEntry = section.items[j].guideEntryRenderer;
                if (!guideEntry) continue;
                const browseId = guideEntry.navigationEndpoint?.browseEndpoint?.browseId || 'search';
                const iconType = guideEntry.icon?.iconType;
                if ((disabledSidebarContents?.length && (disabledSidebarContents.includes(browseId) || disabledSidebarContents.includes(iconType)))
                    || (disableChannelsOnSidebar && guideEntry.thumbnail)) {
                    section.items.splice(j, 1);
                    j--;
                }
            }
        }
    }

    return r;
}

configChangeEmitter.addEventListener('configChange', (e) => {
    if (e.detail.key === 'disabledSidebarContents' || e.detail.key === 'disableChannelsOnSidebar' || e.detail.key === 'sidebarContentsOrder') {
        const commandExecutor = getCommandExecutor();
        if (commandExecutor) {
            commandExecutor.executeFunction(new commandExecutor.commandFunction('reloadGuideAction'));
        }
    }
});