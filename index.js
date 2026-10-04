import { extension_settings, getContext } from '../../../extensions.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { saveBase64AsFile } from '../../../utils.js';
import { getMessageTimeStamp } from '../../../RossAscends-mods.js';
import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { MEDIA_DISPLAY, MEDIA_SOURCE, MEDIA_TYPE } from '../../../constants.js';

const extensionName = 'st-venice-image';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const MODELS = [
    { id: 'wai-Illustrious', label: 'Anime (WAI) — best anime pick', anime: true },
    { id: 'lustify-v8', label: 'Lustify v8 — uncensored photoreal' },
    { id: 'lustify-v7', label: 'Lustify v7 — uncensored photoreal' },
    { id: 'lustify-sdxl', label: 'Lustify SDXL — uncensored photoreal' },
    { id: 'venice-sd35', label: 'Venice SD35 — general' },
    { id: 'chroma', label: 'Chroma — stylized' },
    { id: 'z-image-turbo', label: 'Z-Image Turbo — fast & cheap' },
];

const SIZES = [
    { label: 'Portrait 832x1216', width: 832, height: 1216 },
    { label: 'Square 1024x1024', width: 1024, height: 1024 },
    { label: 'Landscape 1216x832', width: 1216, height: 832 },
    { label: 'Tall 768x1344', width: 768, height: 1344 },
];

const defaultSettings = {
    api_key: '',
    model: 'wai-Illustrious',
    width: 832,
    height: 1216,
    negative_prompt: 'blurry, low quality, distorted, deformed, watermark, text, logo, worst quality',
    safe_mode: false,
    hide_watermark: true,
    send_to_chat: true,
};

function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (extension_settings[extensionName][key] === undefined) {
            extension_settings[extensionName][key] = value;
        }
    }
}

async function generateVeniceImage(prompt, negativeOverride) {
    const settings = extension_settings[extensionName];
    if (!settings.api_key) {
        throw new Error('Venice API key is not set. Open Extensions > Venice Image Generation and paste your Venice API key.');
    }

    const negative = [negativeOverride, settings.negative_prompt].filter(Boolean).join(', ');

    const body = {
        model: settings.model,
        prompt: prompt,
        width: Number(settings.width) || 832,
        height: Number(settings.height) || 1216,
        format: 'png',
        hide_watermark: !!settings.hide_watermark,
        safe_mode: !!settings.safe_mode,
        return_binary: false,
    };
    if (negative) {
        body.negative_prompt = negative;
    }

    const response = await fetch('https://api.venice.ai/api/v1/image/generate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.api_key}`,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Venice API error (${response.status}): ${text.slice(0, 300)}`);
    }

    const data = await response.json();
    if (!data.images || !data.images.length) {
        throw new Error('Venice returned no images.');
    }
    return data.images[0];
}

async function sendImageToChat(prompt, base64Data) {
    const context = getContext();
    const characterName = context.name2 || 'Character';
    const filename = `venice_${Date.now()}`;
    const imageUrl = await saveBase64AsFile(base64Data, characterName, filename, 'png');

    const mediaAttachment = {
        url: imageUrl,
        type: MEDIA_TYPE.IMAGE,
        title: prompt,
        generation_type: 'venice',
        source: MEDIA_SOURCE.GENERATED,
    };

    const message = {
        name: context.groupId ? context.groupId : context.name2,
        is_user: false,
        is_system: false,
        send_date: getMessageTimeStamp(),
        mes: prompt,
        extra: {
            media: [mediaAttachment],
            media_display: MEDIA_DISPLAY.GALLERY,
            media_index: 0,
            inline_image: false,
        },
    };

    context.chat.push(message);
    const messageId = context.chat.length - 1;
    await eventSource.emit(event_types.MESSAGE_RECEIVED, messageId, 'extension');
    context.addOneMessage(message);
    await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, messageId, 'extension');
    await context.saveChat();
}

function registerSlashCommand() {
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'vimg',
        callback: async (args, prompt) => {
            prompt = (prompt || '').trim();
            if (!prompt) {
                toastr.warning('Give me a prompt: /vimg a catgirl knight at sunset', 'Venice Image');
                return '';
            }
            try {
                toastr.info('Generating image with Venice...', 'Venice Image');
                const base64 = await generateVeniceImage(prompt, args?.negative);
                if (extension_settings[extensionName].send_to_chat) {
                    await sendImageToChat(prompt, base64);
                } else {
                    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
                    const url = URL.createObjectURL(blob);
                    window.open(url, '_blank');
                }
                toastr.success('Image generated.', 'Venice Image');
                return 'Image generated.';
            } catch (error) {
                const msg = error?.message || String(error);
                toastr.error(msg, 'Venice Image');
                return '';
            }
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'negative',
                description: 'negative prompt for this generation',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
                acceptsMultiple: false,
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                name: 'prompt',
                description: 'image prompt',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
            }),
        ],
        helpString: 'Generate an image with Venice AI (default model: Anime WAI). Usage: /vimg <prompt>',
    }));
}

function wireSettingsHtml() {
    const s = extension_settings[extensionName];

    $('#venice_image_api_key').val(s.api_key);
    $('#venice_image_api_key').on('input', function () {
        s.api_key = String($(this).val());
        saveSettingsDebounced();
    });

    const modelSelect = $('#venice_image_model');
    modelSelect.empty();
    for (const m of MODELS) {
        modelSelect.append($('<option></option>').val(m.id).text(m.label));
    }
    modelSelect.val(s.model);
    modelSelect.on('change', function () {
        s.model = String($(this).val());
        saveSettingsDebounced();
    });

    const sizeSelect = $('#venice_image_size');
    sizeSelect.empty();
    for (const sz of SIZES) {
        sizeSelect.append($('<option></option>').val(`${sz.width}x${sz.height}`).text(sz.label));
    }
    const currentSize = `${s.width}x${s.height}`;
    if (SIZES.some(z => `${z.width}x${z.height}` === currentSize)) {
        sizeSelect.val(currentSize);
    } else {
        sizeSelect.prepend($('<option></option>').val(currentSize).text(`Custom ${currentSize}`));
        sizeSelect.val(currentSize);
    }
    sizeSelect.on('change', function () {
        const [w, h] = String($(this).val()).split('x').map(Number);
        s.width = w;
        s.height = h;
        saveSettingsDebounced();
    });

    $('#venice_image_negative').val(s.negative_prompt);
    $('#venice_image_negative').on('input', function () {
        s.negative_prompt = String($(this).val());
        saveSettingsDebounced();
    });

    $('#venice_image_safe_mode').prop('checked', !!s.safe_mode);
    $('#venice_image_safe_mode').on('input', function () {
        s.safe_mode = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    $('#venice_image_hide_watermark').prop('checked', !!s.hide_watermark);
    $('#venice_image_hide_watermark').on('input', function () {
        s.hide_watermark = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    $('#venice_image_send_to_chat').prop('checked', !!s.send_to_chat);
    $('#venice_image_send_to_chat').on('input', function () {
        s.send_to_chat = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    $('#venice_image_test').on('click', async () => {
        try {
            toastr.info('Generating test image...', 'Venice Image');
            const base64 = await generateVeniceImage('anime portrait of a catgirl knight, detailed, high quality', '');
            await sendImageToChat('Venice test image: anime portrait of a catgirl knight', base64);
            toastr.success('Test image generated.', 'Venice Image');
        } catch (error) {
            toastr.error(error?.message || String(error), 'Venice Image');
        }
    });
}

function stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || div.innerText || '').trim();
}

async function generateFromMessage(messageId) {
    const context = getContext();
    const message = context.chat[messageId];
    if (!message) {
        return;
    }
    let prompt = stripHtml(message.mes || '');
    if (!prompt) {
        toastr.warning('Message is empty.', 'Venice Image');
        return;
    }
    // Keep prompts at a reasonable length for the image model
    if (prompt.length > 1500) {
        prompt = prompt.slice(0, 1500);
    }
    try {
        toastr.info('Generating image from message...', 'Venice Image');
        const base64 = await generateVeniceImage(prompt, '');
        await sendImageToChat(`Image for: ${prompt.slice(0, 120)}${prompt.length > 120 ? '...' : ''}`, base64);
        toastr.success('Image generated.', 'Venice Image');
    } catch (error) {
        toastr.error(error?.message || String(error), 'Venice Image');
    }
}

function addMessageButton(messageId) {
    const context = getContext();
    const message = context.chat[messageId];
    // Only on character messages, not user/system
    if (!message || message.is_user || message.is_system) {
        return;
    }
    const messageElement = $(`.mes[mesid="${messageId}"]`);
    const buttonsContainer = messageElement.find('.mes_buttons');
    if (!buttonsContainer.length || buttonsContainer.find('.venice-img-btn').length) {
        return;
    }
    const button = $('<div class="mes_button venice-img-btn fa-solid fa-image" title="Generate image with Venice"></div>');
    button.on('click', () => generateFromMessage(messageId));
    buttonsContainer.append(button);
}

function registerMessageButtons() {
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
        addMessageButton(messageId);
    });
    // Add to messages already rendered
    const context = getContext();
    if (Array.isArray(context.chat)) {
        for (let i = 0; i < context.chat.length; i++) {
            addMessageButton(i);
        }
    }
}

jQuery(async () => {
    loadSettings();
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $('#extensions_settings').append(settingsHtml);
    wireSettingsHtml();
    registerSlashCommand();
    registerMessageButtons();
    console.log('[Venice Image] extension loaded');
});
