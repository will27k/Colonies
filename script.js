const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}

function drawPixel(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
}

let goldTiles = [];
let foodTiles = [];

let gameHasStartedOnce = false; // Flag to track if the game has started at least once
let currentModalColonyIndex = -1; // Track which colony's upgrade modal is open
let currentPriorityModalColonyIndex = -1; // Track which colony's priority modal is open
let currentArtilleryTargetingModalColonyIndex = -1; // Track which colony's artillery targeting modal is open

let colonyIntervals = [null, null, null, null]; // Store interval IDs for each colony
let artilleryIntervals = [null, null, null, null]; // Store artillery interval IDs

const MAX_ARTILLERY_FIRE_RATE_LEVEL = 8; // 5000ms -> 1000ms in 500ms steps
const MAX_ARTILLERY_AREA_SIZE_LEVEL = 6;   // NEW: Internal 5u -> 17u (Visual ~15px -> 51px)
const BASE_ARTILLERY_DIAMETER = 5;         // NEW (Internal)
const ARTILLERY_DIAMETER_INCREASE_PER_LEVEL = 2; // NEW (Internal)
const ARTILLERY_PRIORITY_COST = 25;
const MAX_ARTILLERY_FOCUS_LEVEL = 10;    // NEW: To reach 100px from 200px in 10px steps
const BASE_ARTILLERY_RANDOMNESS = 67;   // NEW (Internal equivalent of ~200px visual)
const ARTILLERY_RANDOMNESS_REDUCTION = 3; // NEW (Internal equivalent of ~10px visual reduction per level)
const MIN_ARTILLERY_RANDOMNESS = 33;     // NEW (Internal equivalent of ~100px visual min)

function spawnGoldAndFood() {
    const goldX = getRandomInt(canvas.width);
    const goldY = getRandomInt(canvas.height);
    goldTiles.push({ x: goldX, y: goldY });
    drawPixel(goldX, goldY, 'yellow');

    const foodX = getRandomInt(canvas.width);
    const foodY = getRandomInt(canvas.height);
    foodTiles.push({ x: foodX, y: foodY });
    drawPixel(foodX, foodY, 'white');
}

function updateColonyStats() {
    colonies.forEach((colony, index) => {
        const colonyInfoPanel = document.querySelector(`#colony-${index}-info`);
        if (!colonyInfoPanel) return;

        let statsDiv = colonyInfoPanel.querySelector('.colony-stats');
        if (!statsDiv) {
            statsDiv = document.createElement('div');
            statsDiv.className = 'colony-stats';
            colonyInfoPanel.insertBefore(statsDiv, colonyInfoPanel.querySelector('.colony-upgrades'));
        }

        // Update or create text elements for stats
        let titleEl = statsDiv.querySelector('.colony-title');
        if (!titleEl) {
            titleEl = document.createElement('h3');
            titleEl.className = 'colony-title';
            statsDiv.appendChild(titleEl);
        }
        titleEl.style.color = `var(--${colony.color.toLowerCase()}-colony-color)`;

        if (colony.isDefeated) {
            titleEl.textContent = `${colony.color.toUpperCase()} Colony (Defeated)`;
            updateOrCreateStatParagraph(statsDiv, 'pixels', `Pixels: 0 - Eliminated`);
            updateOrCreateStatParagraph(statsDiv, 'gold', `Gold: ${colony.gold}`); // Show last gold count
            updateOrCreateStatParagraph(statsDiv, 'current-priority', `Priority: N/A`);
            // Remove artillery target stat if colony is defeated
            const defeatedTargetStatEl = statsDiv.querySelector('.stat-artillery-target');
            if (defeatedTargetStatEl) defeatedTargetStatEl.remove();
            
            // Remove/hide buttons for defeated colonies
            const pButtonsDiv = statsDiv.querySelector('.priority-buttons');
            if (pButtonsDiv) pButtonsDiv.innerHTML = '';
            const uButton = statsDiv.querySelector('.open-upgrades-button');
            if (uButton) uButton.style.display = 'none';
        } else {
            titleEl.textContent = `${colony.color.toUpperCase()} Colony ${colony.isAI ? '(AI)' : '(Player)'}`;
            updateOrCreateStatParagraph(statsDiv, 'pixels', `Pixels: ${colony.pixels.length}`);
            updateOrCreateStatParagraph(statsDiv, 'gold', `Gold: ${colony.gold}`);
            updateOrCreateStatParagraph(statsDiv, 'current-priority', `Priority: ${colony.priority.toUpperCase()}`);
            
            // --- Artillery Target Stat --- MOVED HERE (After Priority)
            if (colony.hasArtillery || colony.pendingUpgrades.artillery) { 
                let targetText = 'Random';
                if (colony.artilleryTargetIndex !== -1 && 
                    colony.artilleryTargetIndex < colonies.length && 
                    colonies[colony.artilleryTargetIndex]) {
                     
                     const targetColony = colonies[colony.artilleryTargetIndex];
                     if (!targetColony.isDefeated) { 
                         targetText = `Targeting ${targetColony.color.toUpperCase()}`;
                     } else {
                         // If target is defeated, revert display to Random
                     }
                }
                updateOrCreateStatParagraph(statsDiv, 'artillery-target', `Artillery: ${targetText}`);
            } else {
                const targetStatEl = statsDiv.querySelector('.stat-artillery-target');
                if (targetStatEl) targetStatEl.remove();
            }
            // --- END Artillery Target Stat ---

            // Ensure buttons are visible for non-defeated human players
            let priorityButtonsDiv = statsDiv.querySelector('.priority-buttons');
            if (!colony.isAI) {
                if (!priorityButtonsDiv) {
                    priorityButtonsDiv = document.createElement('div');
                    priorityButtonsDiv.className = 'priority-buttons'; 
                    statsDiv.appendChild(priorityButtonsDiv);
                }
                let pixelFocusButton = priorityButtonsDiv.querySelector('.pixel-focus-button');
                if (!pixelFocusButton) {
                    pixelFocusButton = document.createElement('button');
                    pixelFocusButton.className = 'pixel-focus-button';
                    pixelFocusButton.textContent = 'Pixel Focus';
                    pixelFocusButton.title = 'Set colony pixel focus priority';
                    pixelFocusButton.onclick = () => openPriorityModal(index);
                    priorityButtonsDiv.appendChild(pixelFocusButton);
                } else {
                    pixelFocusButton.style.display = ''; // Ensure visible
                }

                // Add Artillery Targeting button INSIDE priority div if the colony has the upgrade
                let artilleryTargetingButton = priorityButtonsDiv.querySelector('.artillery-targeting-button');
                if (colony.hasArtilleryPriority) {
                    if (!artilleryTargetingButton) {
                        artilleryTargetingButton = document.createElement('button');
                        artilleryTargetingButton.className = 'artillery-targeting-button';
                        artilleryTargetingButton.textContent = 'Target'; // Renamed
                        artilleryTargetingButton.title = 'Set artillery targeting priority';
                        artilleryTargetingButton.onclick = () => openArtilleryTargetingModal(index);
                        priorityButtonsDiv.appendChild(artilleryTargetingButton); // Append inside priority div
                    } else {
                        artilleryTargetingButton.style.display = ''; // Ensure visible
                    }
                } else if (artilleryTargetingButton) {
                    artilleryTargetingButton.style.display = 'none'; // Hide if upgrade not present
                }

                // Create/Update Open Upgrades button (Place AFTER the priorityButtonsDiv)
                let openUpgradesBtn = statsDiv.querySelector('.open-upgrades-button');
                const upgradesAnchor = priorityButtonsDiv; // Anchor is now always the priority div

                if (!openUpgradesBtn) {
                    openUpgradesBtn = document.createElement('button');
                    openUpgradesBtn.className = 'open-upgrades-button';
                    openUpgradesBtn.textContent = 'View Upgrades';
                    openUpgradesBtn.onclick = () => openUpgradeModal(index);
                    // Insert after the determined anchor (Priority div)
                    if (upgradesAnchor) upgradesAnchor.insertAdjacentElement('afterend', openUpgradesBtn);
                    else statsDiv.appendChild(openUpgradesBtn); // Fallback
                } else {
                    openUpgradesBtn.style.display = ''; // Ensure visible
                    // Ensure correct positioning relative to the anchor if it already exists
                    if (upgradesAnchor && openUpgradesBtn.previousElementSibling !== upgradesAnchor) {
                         if (upgradesAnchor.nextElementSibling) {
                            statsDiv.insertBefore(openUpgradesBtn, upgradesAnchor.nextElementSibling);
                         } else {
                            statsDiv.appendChild(openUpgradesBtn); // Move to end if anchor is last
                         }
                    } else if (!upgradesAnchor && statsDiv.firstChild !== openUpgradesBtn) {
                        // Handle case where priorityButtonsDiv might not exist initially?
                        statsDiv.insertBefore(openUpgradesBtn, statsDiv.firstChild);
                    }
                }
            } else if (priorityButtonsDiv) { // AI colony
                priorityButtonsDiv.innerHTML = ''; 
                let openUpgradesBtn = statsDiv.querySelector('.open-upgrades-button');
                if(openUpgradesBtn) openUpgradesBtn.remove();
            }
        }
    });
}

function updateOrCreateStatParagraph(parent, idSuffix, text) {
    let pElement = parent.querySelector(`.stat-${idSuffix}`);
    if (!pElement) {
        pElement = document.createElement('p');
        pElement.className = `stat-${idSuffix}`;
        parent.appendChild(pElement);
    }
    pElement.textContent = text;
}

let redUpgradeLevel = 0;
let gameInterval;
let spawnInterval;
let upgradeInterval;
let roundTimerInterval; // For the visual countdown timer
let roundTimeRemaining = 60; // Time in seconds for a round

function startGame() {
    try {
        // Clear intervals specific to the game round STARTING NOW
        clearInterval(spawnInterval);
        clearInterval(upgradeInterval);
        clearInterval(roundTimerInterval);

        colonyIntervals.forEach(interval => { if (interval) clearInterval(interval); });
        colonyIntervals = [null, null, null, null];

        document.querySelectorAll('.colony-upgrades').forEach(div => div.style.display = 'none');

        roundTimeRemaining = 60;
        updateTimerDisplay();

    } catch (error) {
        console.error("ERROR DURING startGame interval cleanup:", error);
    }

    try {
        colonies.forEach((colony, index) => {
            if (!colony.isDefeated) {
                const colonySpeed = 100 - (colony.speedUpgradeLevel * 10);
                colonyIntervals[index] = setInterval(() => {
                    if (!colony.isDefeated) {
                        colony.pixels.forEach(pixel => {
                            drawPixel(pixel.x, pixel.y, 'black'); 
                            movePixel(pixel, colony, index);
                            if (colony.pixels.includes(pixel)) {
                                drawPixel(pixel.x, pixel.y, colony.color); 
                            }
                        });
                        updateColonyStats();
                    }
                }, colonySpeed);
            }
        });
    } catch (error) {
        console.error("ERROR DURING startGame pixel movement setup:", error);
    }

    try {
        spawnInterval = setInterval(spawnGoldAndFood, 200);
        upgradeInterval = setTimeout(showUpgrades, 60000);
        roundTimerInterval = setInterval(tickRoundTimer, 1000);

    } catch (error) {
        console.error("ERROR DURING startGame interval/timeout setup:", error);
    }
}

function tickRoundTimer() {
    roundTimeRemaining--;
    updateTimerDisplay();
    if (roundTimeRemaining <= 0) {
        clearInterval(roundTimerInterval); // Stop timer when it reaches 0
        // showUpgrades is already set by setTimeout, so no need to call it here explicitly
    }
}

function updateTimerDisplay() {
    const timerDisplay = document.getElementById('gameTimerDisplay');
    if (timerDisplay) {
        const minutes = Math.floor(roundTimeRemaining / 60);
        const seconds = roundTimeRemaining % 60;
        timerDisplay.textContent = `Time: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

function calculateUpgradeCost(currentLevel, baseCostValue = 5) {
    const multiplier = 1.6;
    return Math.ceil(baseCostValue * Math.pow(multiplier, currentLevel));
}

function buyUpgrade(colonyIndex, type, calledFromModal = false) {
    const colony = colonies[colonyIndex];
    if (colony.isAI) return; 

    // Check for base artillery requirement for sub-upgrades
    const needsBaseArtillery = ['artilleryFireRate', 'artilleryAreaSize', 'artilleryPriority'];
    if (needsBaseArtillery.includes(type) && !(colony.hasArtillery || colony.pendingUpgrades.artillery)) {
        alert(`Colony ${colony.color} needs to purchase Artillery first to unlock ${type}!`);
        return;
    }
    // Check for Artillery Priority requirement for Artillery Focus
    if (type === 'artilleryFocus' && !colony.hasArtilleryPriority) {
        alert(`Colony ${colony.color} needs to purchase Artillery Priority first to unlock Artillery Focus!`);
        return;
    }

    // Special handling for base Artillery
    if (type === 'artillery') {
        const artilleryCost = 50;
        if (colony.hasArtillery || colony.pendingUpgrades.artillery) {
            alert(`Colony ${colony.color} already has Artillery (or it's pending).`);
            return;
        }
        if (colony.gold >= artilleryCost) {
            colony.gold -= artilleryCost;
            colony.pendingUpgrades.artillery = true;
        } else {
            alert(`Not enough gold for Artillery! Cost: ${artilleryCost}, Your Gold: ${colony.gold}`);
            return; // Not enough gold, stop here
        }
    } 
    // Special handling for Artillery Priority
    else if (type === 'artilleryPriority') {
        if (colony.hasArtilleryPriority || colony.pendingUpgrades.artilleryPriority) {
            alert(`Colony ${colony.color} already has Artillery Priority (or it's pending).`);
            return;
        }
        if (colony.gold >= ARTILLERY_PRIORITY_COST) {
            colony.gold -= ARTILLERY_PRIORITY_COST;
            // Apply immediately, not pending
            colony.hasArtilleryPriority = true; 
            // Remove pending logic for this upgrade
            // colony.pendingUpgrades.artilleryPriority = true;
        } else {
            alert(`Not enough gold for Artillery Priority! Cost: ${ARTILLERY_PRIORITY_COST}, Your Gold: ${colony.gold}`);
            return; // Not enough gold, stop here
        }
    } 
    // Standard Upgrades (including other artillery sub-upgrades)
    else {
        let effectiveCurrentLevel;
        let maxLevel = 10; // Default maxLevel for old upgrades
        let actualBaseCost = 5; // Default base cost for standard upgrades

        if (type === 'food') {
            effectiveCurrentLevel = colony.upgradeLevel + colony.pendingUpgrades.food;
        } else if (type === 'pixel') {
            effectiveCurrentLevel = colony.pixelUpgradeLevel + colony.pendingUpgrades.pixel;
        } else if (type === 'focus') {
            effectiveCurrentLevel = colony.focusUpgradeLevel + colony.pendingUpgrades.focus;
        } else if (type === 'strength') {
            effectiveCurrentLevel = colony.strengthUpgradeLevel + colony.pendingUpgrades.strength;
        } else if (type === 'speed') {
            effectiveCurrentLevel = colony.speedUpgradeLevel + colony.pendingUpgrades.speed;
            maxLevel = 5;
        } else if (type === 'artilleryFireRate') {
            effectiveCurrentLevel = colony.artilleryFireRateLevel + colony.pendingUpgrades.artilleryFireRate;
            maxLevel = MAX_ARTILLERY_FIRE_RATE_LEVEL;
        } else if (type === 'artilleryAreaSize') {
            effectiveCurrentLevel = colony.artilleryAreaSizeLevel + colony.pendingUpgrades.artilleryAreaSize;
            maxLevel = MAX_ARTILLERY_AREA_SIZE_LEVEL;
        } else if (type === 'artilleryFocus') { 
            effectiveCurrentLevel = colony.artilleryFocusLevel + colony.pendingUpgrades.artilleryFocus;
            maxLevel = MAX_ARTILLERY_FOCUS_LEVEL;
        } else if (type === 'interest') { // Handle interest upgrade
            effectiveCurrentLevel = colony.interestUpgradeLevel + colony.pendingUpgrades.interest;
            maxLevel = 5; // Max level for interest is 5
            actualBaseCost = 15; // Interest base cost is 15
        } else {
            console.error("Unknown upgrade type in buyUpgrade:", type);
            return; 
        }

        const upgradeCost = calculateUpgradeCost(effectiveCurrentLevel, actualBaseCost); // Use actualBaseCost
        if (colony.gold >= upgradeCost && effectiveCurrentLevel < maxLevel) {
            colony.gold -= upgradeCost;
            if (type === 'food') colony.pendingUpgrades.food++;
            else if (type === 'pixel') colony.pendingUpgrades.pixel++;
            else if (type === 'focus') colony.pendingUpgrades.focus++;
            else if (type === 'strength') colony.pendingUpgrades.strength++;
            else if (type === 'speed') colony.pendingUpgrades.speed++;
            else if (type === 'artilleryFireRate') colony.pendingUpgrades.artilleryFireRate++;
            else if (type === 'artilleryAreaSize') colony.pendingUpgrades.artilleryAreaSize++;
            else if (type === 'artilleryFocus') colony.pendingUpgrades.artilleryFocus++; // Increment pending
            else if (type === 'interest') colony.pendingUpgrades.interest++; // Add interest case

            console.log(`${colony.color} queued ${type} upgrade purchase. Gold after cost: ${colony.gold}. Pending ${type}: ${colony.pendingUpgrades[type] || colony.pendingUpgrades.artillery}`);

            // Refresh modal if called from there
        } else if (effectiveCurrentLevel >= maxLevel) {
            alert(`Maximum ${type} upgrade level (including pending) reached for ${colony.color} colony!`);
            return;
        } else {
            alert(`Not enough gold for ${colony.color} colony to buy next ${type} upgrade! Cost: ${upgradeCost}, Your Gold: ${colony.gold}`);
            return;
        }
    }
    
    // Common actions after any successful purchase attempt that wasn't stopped by an alert
    updateColonyStats();
    if (calledFromModal && currentModalColonyIndex === colonyIndex) {
        populateUpgradeModalContent(colonyIndex);
    }
}

function resetGame() {
    // Ensure upgrade UI is hidden
    document.querySelectorAll('.colony-upgrades').forEach(div => div.style.display = 'none');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    goldTiles = [];
    foodTiles = [];

    colonies.forEach((colony, index) => {
        if (colony.isDefeated) {
            colony.pixels = [];
            return;
        }
        // Apply pending upgrades
        colony.upgradeLevel += colony.pendingUpgrades.food;
        colony.pixelUpgradeLevel += colony.pendingUpgrades.pixel;
        colony.focusUpgradeLevel += colony.pendingUpgrades.focus;
        colony.strengthUpgradeLevel += colony.pendingUpgrades.strength;
        colony.speedUpgradeLevel += colony.pendingUpgrades.speed;
        if (colony.pendingUpgrades.artillery) {
            colony.hasArtillery = true;
        }
        colony.artilleryFireRateLevel += colony.pendingUpgrades.artilleryFireRate;
        colony.artilleryAreaSizeLevel += colony.pendingUpgrades.artilleryAreaSize;
        colony.artilleryFocusLevel += colony.pendingUpgrades.artilleryFocus; // Apply pending focus
        colony.interestUpgradeLevel += colony.pendingUpgrades.interest; // Apply pending interest
        
        // Reset pending upgrades
        colony.pendingUpgrades = { food: 0, pixel: 0, focus: 0, strength: 0, speed: 0, artillery: false, artilleryFireRate: 0, artilleryAreaSize: 0, artilleryFocus: 0, interest: 0 }; // Add interest to reset

        // Clamp levels
        colony.upgradeLevel = Math.min(colony.upgradeLevel, 10);
        colony.pixelUpgradeLevel = Math.min(colony.pixelUpgradeLevel, 10);
        colony.focusUpgradeLevel = Math.min(colony.focusUpgradeLevel, 10);
        colony.strengthUpgradeLevel = Math.min(colony.strengthUpgradeLevel, 10);
        colony.speedUpgradeLevel = Math.min(colony.speedUpgradeLevel, 5);
        colony.artilleryFireRateLevel = Math.min(colony.artilleryFireRateLevel, MAX_ARTILLERY_FIRE_RATE_LEVEL);
        colony.artilleryAreaSizeLevel = Math.min(colony.artilleryAreaSizeLevel, MAX_ARTILLERY_AREA_SIZE_LEVEL);
        colony.artilleryFocusLevel = Math.min(colony.artilleryFocusLevel, MAX_ARTILLERY_FOCUS_LEVEL); // Clamp focus level
        colony.interestUpgradeLevel = Math.min(colony.interestUpgradeLevel, 5); // Clamp interest level (Max 5)
        
        const startingPixels = 10 + colony.pixelUpgradeLevel * 5;
        const corner = getCornerCoordinates(index, canvas);
        colony.pixels = Array.from({ length: startingPixels }, () => ({ x: corner.x, y: corner.y, randomMoveCount: 0 }));

        // Start artillery AFTER applying upgrades so it uses the correct level
        if (colony.hasArtillery) {
            startArtilleryFiring(index); 
        }
    });

    if (!gameHasStartedOnce) {
        gameHasStartedOnce = true;
    }

    startGame(); 
    
    runAIPrioritySetting(); 
    updateColonyStats();   
}

function getCornerCoordinates(index, canvas) {
    switch (index) {
        case 0: return { x: 0, y: 0 }; // Top-left
        case 1: return { x: canvas.width - 1, y: 0 }; // Top-right
        case 2: return { x: 0, y: canvas.height - 1 }; // Bottom-left
        case 3: return { x: canvas.width - 1, y: canvas.height - 1 }; // Bottom-right
        default: return { x: 0, y: 0 };
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded event fired."); // Log 1
    // Event listener for the button on the startup screen
    document.getElementById('initializeGameButton').addEventListener('click', initializeGameSetup);
    console.log("Added click listener to initializeGameButton."); // Log 2

    // Event listener for closing the upgrade modal
    document.getElementById('closeUpgradeModal').addEventListener('click', closeUpgradeModal);

    // About Modal Listeners
    const openAboutModalButton = document.getElementById('openAboutModalButton');
    const aboutModal = document.getElementById('aboutModal');
    const closeAboutModalButton = document.getElementById('closeAboutModal');
    const aboutModalContent = document.getElementById('aboutModalContent');
    const gameInfoSection = document.getElementById('gameInfoSection');

    if (openAboutModalButton) {
        openAboutModalButton.addEventListener('click', () => {
            if (gameInfoSection && aboutModalContent) {
                aboutModalContent.innerHTML = gameInfoSection.innerHTML;
            }
            if (aboutModal) aboutModal.style.display = 'flex';
        });
    }

    if (closeAboutModalButton) {
        closeAboutModalButton.addEventListener('click', () => {
            if (aboutModal) aboutModal.style.display = 'none';
        });
    }

    if (aboutModal) {
        aboutModal.addEventListener('click', (event) => {
            if (event.target === aboutModal) { // Click was directly on the overlay
                aboutModal.style.display = 'none';
            }
        });
    }

    // Close upgrade modal if clicking outside the modal content (on the overlay)
    const upgradeModalOverlay = document.getElementById('upgradeModal');
    if (upgradeModalOverlay) { // Ensure the element exists
        upgradeModalOverlay.addEventListener('click', (event) => {
            if (event.target === upgradeModalOverlay) { // Check if the click was directly on the overlay
                closeUpgradeModal();
            }
        });
    }

    // Set initial UI state: show startup screen, hide game content and reset button
    const startupScreen = document.getElementById('startupScreen');
    const gameContent = document.getElementById('gameContent');
    const resetGameButtonContainer = document.getElementById('resetGameButtonContainer');

    if (startupScreen) startupScreen.style.display = 'flex'; // Or 'block' based on your CSS for it
    if (gameContent) gameContent.style.display = 'none';
    if (resetGameButtonContainer) resetGameButtonContainer.style.display = 'none';
    
    // Do NOT call resetGame() here. The game starts via initializeGameSetup.

    // Priority Modal Listeners
    const priorityModal = document.getElementById('priorityModal');
    const closePriorityModalButton = document.getElementById('closePriorityModal');

    if (closePriorityModalButton) {
        closePriorityModalButton.addEventListener('click', closePriorityModal);
    }
    if (priorityModal) {
        priorityModal.addEventListener('click', (event) => {
            if (event.target === priorityModal) { // Click was directly on the overlay
                closePriorityModal();
            }
        });
    }

    // Artillery Targeting Modal Listeners
    const artilleryTargetingModal = document.getElementById('artilleryTargetingModal');
    const closeArtilleryTargetingModalButton = document.getElementById('closeArtilleryTargetingModal');

    if (closeArtilleryTargetingModalButton) {
        closeArtilleryTargetingModalButton.addEventListener('click', closeArtilleryTargetingModal);
    }
    if (artilleryTargetingModal) {
        artilleryTargetingModal.addEventListener('click', (event) => {
            if (event.target === artilleryTargetingModal) { // Click was directly on the overlay
                closeArtilleryTargetingModal();
            }
        });
    }

    // Win Modal Play Again Button
    const playAgainButton = document.getElementById('playAgainButton');
    if (playAgainButton) {
        playAgainButton.addEventListener('click', handlePlayAgain);
    }

    function handleUpgradePurchase(upgradeId) {
        const config = upgradesConfig[upgradeId];
        if (!config) return;

        let requirementMet = true;
        if (config.requires) {
            const requiredUpgrade = upgradesConfig[config.requires];
            if (!requiredUpgrade || requiredUpgrade.currentLevel < 1) {
                requirementMet = false;
            }
        }

        if (!requirementMet) {
            console.log(`Requirement not met for ${config.name}`);
            // Potentially show a message to the user
            return;
        }

        if (config.currentLevel >= config.maxLevel) {
            console.log(`${config.name} is already at max level.`);
            return;
        }

        const cost = getUpgradeCost(upgradeId);
        if (playerColonyGold.current >= cost) {
            playerColonyGold.current -= cost;
            config.currentLevel++;
            console.log(`${config.name} purchased. New level: ${config.currentLevel}. Gold: ${playerColonyGold.current}`);
            
            // After purchase, refresh all UIs as dependencies might have changed
            initializeAllUpgradeBoxesUI(); 
            // TODO: Actually apply upgrade effect to the game state
        } else {
            console.log(`Not enough gold for ${config.name}. Need ${cost}, have ${playerColonyGold.current}`);
            // Potentially show a message to the user
        }
    }

    // Attach event listeners to upgrade boxes
    document.querySelectorAll('#testUpgradeModal .upgrade-node-box').forEach(box => {
        box.addEventListener('click', () => {
            // Check if the box is disabled before processing purchase
            if (box.classList.contains('disabled') || box.classList.contains('locked') || box.classList.contains('maxed')) {
                console.log('Upgrade box is not clickable (disabled, locked, or maxed).');
                return;
            }
            const upgradeId = box.dataset.upgradeId;
            handleUpgradePurchase(upgradeId);
        });
    });



    // If you have a button to open the testUpgradeModal, e.g., id="openTestUpgradeModalButton"
    // You might want to refresh the UI each time it's opened.
    const openTestModalButton = document.getElementById('openTestUpgradeModalButton');
    if (openTestModalButton) {
        openTestModalButton.addEventListener('click', () => {
            // Re-initialize/update gold and upgrade UI every time modal is opened
            // This is important if player gold changes or upgrades are bought elsewhere
            // playerColonyGold.current = getCurrentPlayerGold(); // Fetch current gold from game state
            initializeAllUpgradeBoxesUI();
        });
    }
    
    // The following redundant tab switching logic (previously added and causing errors) is now removed.
    // const militaryTabButton = document.getElementById('militaryTabButton'); 
    // const utilityTabButton = document.getElementById('utilityTabButton');
    // const militaryTabContent = document.getElementById('militaryTabContent');
    // const utilityTabContent = document.getElementById('utilityTabContent');

    // if (militaryTabButton && utilityTabButton && militaryTabContent && utilityTabContent) { .. } 
    // ... (rest of the redundant block removed)

}); // This is the closing of the main DOMContentLoaded event listener

function movePixel(pixel, colony, colonyIndex) {
    let moved = false;
    const requiredRandomMoves = Math.max(1, 10 - colony.focusUpgradeLevel);

    if (colony.priority !== 'none' && pixel.randomMoveCount >= requiredRandomMoves) {
        pixel.randomMoveCount = 0;
        let nearestTarget = null;
        if (colony.priority === 'food') {
            nearestTarget = findNearest(pixel, foodTiles);
        } else if (colony.priority === 'gold') {
            nearestTarget = findNearest(pixel, goldTiles);
        } else if (colony.priority === 'pixel') {
            nearestTarget = findNearestEnemyPixel(pixel, colonyIndex);
        }
        
        if (nearestTarget) {
            const targetDx = Math.sign(nearestTarget.x - pixel.x);
            const targetDy = Math.sign(nearestTarget.y - pixel.y);
            if (targetDx !== 0 || targetDy !== 0) {
                pixel.x = Math.max(0, Math.min(canvas.width - 1, pixel.x + targetDx));
                pixel.y = Math.max(0, Math.min(canvas.height - 1, pixel.y + targetDy));
                moved = true;
            }
        }
    }

    if (!moved) {
        const directions = [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: -1 }, { dx: 0, dy: 1 }];
        const direction = directions[getRandomInt(directions.length)];
        pixel.x = Math.max(0, Math.min(canvas.width - 1, pixel.x + direction.dx));
        pixel.y = Math.max(0, Math.min(canvas.height - 1, pixel.y + direction.dy));
        if (colony.priority !== 'none' && colony.priority !== 'pixel') {
            pixel.randomMoveCount++;
        } else if (colony.priority === 'pixel') {
            pixel.randomMoveCount++;
        }
    }

    // --- Combat Resolution --- 
    let attackerSurvived = true;
    for (let otherColonyIndex = 0; otherColonyIndex < colonies.length; otherColonyIndex++) {
        if (otherColonyIndex === colonyIndex) continue; // Don't fight own colony

        const otherColony = colonies[otherColonyIndex];
        const defenderIndex = otherColony.pixels.findIndex(p => p.x === pixel.x && p.y === pixel.y);

        if (defenderIndex !== -1) {
            const defenderPixel = otherColony.pixels[defenderIndex];
            const attackerStrength = 1 + colony.strengthUpgradeLevel;
            const defenderStrength = 1 + otherColony.strengthUpgradeLevel;

            console.log(`${colony.color} pixel (Str: ${attackerStrength}) attacks ${otherColony.color} pixel (Str: ${defenderStrength}) at (${pixel.x},${pixel.y})`);

            if (attackerStrength > defenderStrength) {
                otherColony.pixels.splice(defenderIndex, 1);
                console.log(`${otherColony.color} pixel destroyed.`);
            } else if (defenderStrength > attackerStrength) {
                attackerSurvived = false; // Attacker is destroyed
                console.log(`${colony.color} pixel destroyed.`);
            } else { // Strengths are equal
                if (Math.random() < 0.5) {
                    otherColony.pixels.splice(defenderIndex, 1);
                    console.log(`Tie! ${otherColony.color} pixel destroyed.`);
                } else {
                    attackerSurvived = false;
                    console.log(`Tie! ${colony.color} pixel destroyed.`);
                }
            }
            break; // Fight one pixel per interaction square
        }
    }
    // If attacker did not survive, remove it from its own colony
    if (!attackerSurvived) {
        const attackerPixelIndex = colony.pixels.indexOf(pixel);
        if (attackerPixelIndex !== -1) {
            colony.pixels.splice(attackerPixelIndex, 1);
        }
        return; // Attacker died, no further actions for this pixel this turn
    }
    // --- End Combat Resolution ---

    const foodIndex = foodTiles.findIndex(food => food.x === pixel.x && food.y === pixel.y);
    if (foodIndex !== -1) {
        foodTiles.splice(foodIndex, 1);
        const newPixelCount = 1 + colony.upgradeLevel;
        for (let i = 0; i < newPixelCount; i++) {
            colony.pixels.push({ x: pixel.x, y: pixel.y, randomMoveCount: 0 });
        }
    }

    const goldIndex = goldTiles.findIndex(gold => gold.x === pixel.x && gold.y === pixel.y);
    if (goldIndex !== -1) {
        goldTiles.splice(goldIndex, 1);
        colony.gold += 1;
    }
}

function updateColonies() {
    colonies.forEach((colony, index) => {
        if (colony.isDefeated) return; // Skip defeated colonies

        // Iterate backwards when modifying the array during iteration (pixels being removed)
        for (let i = colony.pixels.length - 1; i >= 0; i--) {
            const pixel = colony.pixels[i];
            drawPixel(pixel.x, pixel.y, 'black'); // Clear old position
            movePixel(pixel, colony, index);      // Move and potentially fight
            // If pixel survived, draw it. If it died in movePixel, it won't be in the array or will be caught by loop condition.
            // However, movePixel itself handles removal, so we must check if it still exists.
            if (colony.pixels.includes(pixel)) { 
                drawPixel(pixel.x, pixel.y, colony.color); // Draw new position
            }
        }
    });

    // After all moves and combat, check for newly defeated colonies
    let potentiallyGameOver = false;
    colonies.forEach((colony, index) => {
        if (!colony.isDefeated && colony.pixels.length === 0) {
            colony.isDefeated = true;
            console.log(`${colony.color.toUpperCase()} COLONY HAS BEEN ELIMINATED!`);
            updateColonyStats(); // Update UI to reflect defeat
            potentiallyGameOver = true;
        }
    });

    if (potentiallyGameOver) {
        checkWinCondition();
    }
    updateColonyStats(); // General refresh
}

function checkWinCondition() {
    const activeColonies = colonies.filter(colony => !colony.isDefeated);

    if (activeColonies.length === 1 && colonies.some(c => c.pixels.length > 0 || c.isDefeated)) {
        const winner = activeColonies[0];
        console.log(`${winner.color.toUpperCase()} COLONY WINS!`);
        
        // Stop all game activities
        colonyIntervals.forEach(interval => clearInterval(interval));
        artilleryIntervals.forEach(interval => clearInterval(interval)); // Clear artillery intervals
        clearInterval(spawnInterval);
        clearInterval(roundTimerInterval);
        clearTimeout(upgradeInterval);

        showWinModal(winner);
    } else if (activeColonies.length === 0 && colonies.filter(c => c.isDefeated).length === colonies.length) {
        console.log("ALL COLONIES DEFEATED! IT'S A DRAW!");
        colonyIntervals.forEach(interval => clearInterval(interval));
        artilleryIntervals.forEach(interval => clearInterval(interval)); // Clear artillery intervals
        clearInterval(spawnInterval);
        clearInterval(roundTimerInterval);
        clearTimeout(upgradeInterval);
        showWinModal(null); // Indicate a draw
    }
}

function showWinModal(winningColony) {
    const winModal = document.getElementById('winModal');
    const winMessage = document.getElementById('winMessage');

    if (winningColony) {
        winMessage.textContent = `${winningColony.color.toUpperCase()} COLONY REIGNS SUPREME!`;
        winMessage.style.color = `var(--${winningColony.color.toLowerCase()}-colony-color)`;
    } else {
        winMessage.textContent = "STALEMATE! ALL COLONIES DEFEATED!";
        winMessage.style.color = 'var(--text-color)'; // Default text color for a draw
    }
    if (winModal) winModal.style.display = 'flex';
}

function handlePlayAgain() {
    const winModal = document.getElementById('winModal');
    const startupScreen = document.getElementById('startupScreen');
    const gameContent = document.getElementById('gameContent');

    if (winModal) winModal.style.display = 'none';
    if (gameContent) gameContent.style.display = 'none';
    if (startupScreen) startupScreen.style.display = 'flex';

    gameHasStartedOnce = false;
    
    // Clear intervals
    colonyIntervals.forEach(interval => { if (interval) clearInterval(interval); });
    artilleryIntervals.forEach(interval => { if (interval) clearInterval(interval); });
    colonyIntervals = [null, null, null, null];
    artilleryIntervals = [null, null, null, null];
    
    // Reset colony properties
    colonies.forEach(colony => {
        colony.pixels = [];
        colony.gold = 0;
        colony.upgradeLevel = 0;
        colony.pixelUpgradeLevel = 0;
        colony.focusUpgradeLevel = 0;
        colony.strengthUpgradeLevel = 0;
        colony.speedUpgradeLevel = 0;
        colony.hasArtillery = false;
        colony.artilleryFireRateLevel = 0; // Reset new level
        colony.artilleryAreaSizeLevel = 0; // Reset new level
        colony.hasArtilleryPriority = false; // Reset new property
        colony.artilleryTargetIndex = -1; // Reset targeting
        colony.artilleryFocusLevel = 0; // Reset focus level
        colony.priority = 'food';
        colony.pendingUpgrades = { food: 0, pixel: 0, focus: 0, strength: 0, speed: 0, artillery: false, artilleryFireRate: 0, artilleryAreaSize: 0, artilleryFocus: 0, interest: 0 }; // Reset pending with focus
        colony.isDefeated = false;
    });
    
    // Clear other game intervals
    clearInterval(spawnInterval);
    clearInterval(roundTimerInterval);
    clearTimeout(upgradeInterval);

    // Clear canvas and resources
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    goldTiles = [];
    foodTiles = [];

    // Reset timer display
    roundTimeRemaining = 60;
    updateTimerDisplay();
    document.getElementById('gameTimerDisplay').textContent = "Time: --:--";

    updateColonyStats();
}

const colonies = [
    { color: 'red', pixels: [], gold: 0, upgradeLevel: 0, pixelUpgradeLevel: 0, focusUpgradeLevel: 0, strengthUpgradeLevel: 0, speedUpgradeLevel: 0, hasArtillery: false, artilleryFireRateLevel: 0, artilleryAreaSizeLevel: 0, hasArtilleryPriority: false, artilleryTargetIndex: -1, artilleryFocusLevel: 0, priority: 'food', isAI: true, pendingUpgrades: { food: 0, pixel: 0, focus: 0, strength: 0, speed: 0, artillery: false, artilleryFireRate: 0, artilleryAreaSize: 0, artilleryFocus: 0, interest: 0 }, isDefeated: false },
    { color: 'green', pixels: [], gold: 0, upgradeLevel: 0, pixelUpgradeLevel: 0, focusUpgradeLevel: 0, strengthUpgradeLevel: 0, speedUpgradeLevel: 0, hasArtillery: false, artilleryFireRateLevel: 0, artilleryAreaSizeLevel: 0, hasArtilleryPriority: false, artilleryTargetIndex: -1, artilleryFocusLevel: 0, priority: 'food', isAI: true, pendingUpgrades: { food: 0, pixel: 0, focus: 0, strength: 0, speed: 0, artillery: false, artilleryFireRate: 0, artilleryAreaSize: 0, artilleryFocus: 0, interest: 0 }, isDefeated: false },
    { color: 'purple', pixels: [], gold: 0, upgradeLevel: 0, pixelUpgradeLevel: 0, focusUpgradeLevel: 0, strengthUpgradeLevel: 0, speedUpgradeLevel: 0, hasArtillery: false, artilleryFireRateLevel: 0, artilleryAreaSizeLevel: 0, hasArtilleryPriority: false, artilleryTargetIndex: -1, artilleryFocusLevel: 0, priority: 'food', isAI: true, pendingUpgrades: { food: 0, pixel: 0, focus: 0, strength: 0, speed: 0, artillery: false, artilleryFireRate: 0, artilleryAreaSize: 0, artilleryFocus: 0, interest: 0 }, isDefeated: false },
    { color: 'blue', pixels: [], gold: 0, upgradeLevel: 0, pixelUpgradeLevel: 0, focusUpgradeLevel: 0, strengthUpgradeLevel: 0, speedUpgradeLevel: 0, hasArtillery: false, artilleryFireRateLevel: 0, artilleryAreaSizeLevel: 0, hasArtilleryPriority: false, artilleryTargetIndex: -1, artilleryFocusLevel: 0, priority: 'food', isAI: true, pendingUpgrades: { food: 0, pixel: 0, focus: 0, strength: 0, speed: 0, artillery: false, artilleryFireRate: 0, artilleryAreaSize: 0, artilleryFocus: 0, interest: 0 }, isDefeated: false }
];

function showUpgrades() {
    console.log("Entering showUpgrades"); // DEBUG
    // Clear intervals specific to the round ending NOW
    clearInterval(spawnInterval);
    clearInterval(roundTimerInterval); // Stop the visual timer
    colonyIntervals.forEach(interval => { if (interval) clearInterval(interval); });
    colonyIntervals = [null, null, null, null];
    artilleryIntervals.forEach(interval => { if (interval) clearInterval(interval); }); // Stop artillery
    artilleryIntervals = [null, null, null, null];

    // --- Calculate and Add Interest ---
    colonies.forEach(colony => {
        if (!colony.isDefeated) {
            const baseInterestRate = 1; // Base rate: $1 per $5
            const interestLevel = colony.interestUpgradeLevel; // Use current applied level, not pending for this round's interest
            const effectiveInterestRatePer5Gold = baseInterestRate + interestLevel; 
            const goldThreshold = 5;
            const maxGoldToConsiderForInterest = 50;
            const maxPossibleInterest = (maxGoldToConsiderForInterest / goldThreshold) * effectiveInterestRatePer5Gold;

            let interestEarned = 0;
            if (colony.gold >= goldThreshold) {
                const relevantGold = Math.min(colony.gold, maxGoldToConsiderForInterest);
                interestEarned = Math.floor(relevantGold / goldThreshold) * effectiveInterestRatePer5Gold;
                interestEarned = Math.min(interestEarned, maxPossibleInterest);
            }

            if (interestEarned > 0) {
                colony.gold += interestEarned;
                console.log(`${colony.color} earned $${interestEarned} interest (Active Lvl ${interestLevel}). New total: ${colony.gold}`); 
            }
        }
    });
    // --- End Interest Calculation ---


    runAIUpgrades(); // AI makes upgrade decisions first
    runAIPrioritySetting(); // AI sets priorities for the next round

    // Clear all colony movement and artillery intervals
    colonyIntervals.forEach(interval => { if (interval) clearInterval(interval); });
    artilleryIntervals.forEach(interval => { if (interval) clearInterval(interval); });
    colonyIntervals = [null, null, null, null];
    artilleryIntervals = [null, null, null, null];

    clearInterval(spawnInterval);
    clearInterval(roundTimerInterval); // Stop the visual timer
    
    console.log("Automated Round Transition: AI Upgrades & Resetting Game...");
    resetGame(); // Initialize and start the next round
}

// Helper function to find the nearest item
function findNearest(currentPixel, itemsArray) {
    if (!itemsArray || itemsArray.length === 0) return null;
    let nearest = null;
    let minDistance = Infinity;

    itemsArray.forEach(item => {
        const distance = Math.abs(currentPixel.x - item.x) + Math.abs(currentPixel.y - item.y);
        if (distance < minDistance) {
            minDistance = distance;
            nearest = item;
        }
    });
    return nearest;
}

function setColonyPriority(colonyIndex, priorityType) {
    if (colonies[colonyIndex]) {
        if (colonies[colonyIndex].priority === priorityType && !colonies[colonyIndex].isAI) return; // No change if already set for human
        colonies[colonyIndex].priority = priorityType;
        colonies[colonyIndex].pixels.forEach(p => p.randomMoveCount = 0); // Reset random move count for new priority targeting
        updateColonyStats();

        // If the priority modal is open for this colony, refresh its content
        if (document.getElementById('priorityModal').style.display === 'flex' && currentPriorityModalColonyIndex === colonyIndex) {
            populatePriorityModalContent(colonyIndex);
        }
    }
}

// Helper to find nearest enemy pixel
function findNearestEnemyPixel(currentPixel, currentPixelColonyIndex) {
    let nearestEnemy = null;
    let minDistance = Infinity;

    colonies.forEach((otherColony, otherColonyIndex) => {
        if (otherColonyIndex === currentPixelColonyIndex) return; // Skip self

        otherColony.pixels.forEach(enemyPixel => {
            const distance = Math.abs(currentPixel.x - enemyPixel.x) + Math.abs(currentPixel.y - enemyPixel.y);
            if (distance < minDistance) {
                minDistance = distance;
                nearestEnemy = enemyPixel;
            }
        });
    });
    return nearestEnemy;
}

function runAIUpgrades() {
    console.log("Running AI Upgrades...");
    colonies.forEach((colony, index) => {
        if (colony.isAI && !colony.isDefeated) {
            // Attempt to buy artillery first if affordable and not owned
            if (!colony.hasArtillery && !colony.pendingUpgrades.artillery && colony.gold >= 50) {
                colony.gold -= 50;
                colony.pendingUpgrades.artillery = true;
                console.log(`AI Colony ${colony.color} queued ARTILLERY upgrade. Gold remaining: ${colony.gold}`);
            }

            // AI buying Artillery Priority
            if ((colony.hasArtillery || colony.pendingUpgrades.artillery) && 
                !(colony.hasArtilleryPriority || colony.pendingUpgrades.artilleryPriority) && 
                colony.gold >= ARTILLERY_PRIORITY_COST) {
                colony.gold -= ARTILLERY_PRIORITY_COST;
                colony.pendingUpgrades.artilleryPriority = true;
                console.log(`AI Colony ${colony.color} queued ARTILLERY PRIORITY upgrade. Gold remaining: ${colony.gold}`);
            }

            let canAffordAnUpgrade = true;
            while (canAffordAnUpgrade && colony.gold > 0) {
                 // Base list of possible upgrades
                 let possibleUpgrades = [
                    { type: 'food', level: colony.upgradeLevel + colony.pendingUpgrades.food, cost: calculateUpgradeCost(colony.upgradeLevel + colony.pendingUpgrades.food), maxLevel: 10 },
                    { type: 'pixel', level: colony.pixelUpgradeLevel + colony.pendingUpgrades.pixel, cost: calculateUpgradeCost(colony.pixelUpgradeLevel + colony.pendingUpgrades.pixel), maxLevel: 10 },
                    { type: 'focus', level: colony.focusUpgradeLevel + colony.pendingUpgrades.focus, cost: calculateUpgradeCost(colony.focusUpgradeLevel + colony.pendingUpgrades.focus), maxLevel: 10 },
                    { type: 'strength', level: colony.strengthUpgradeLevel + colony.pendingUpgrades.strength, cost: calculateUpgradeCost(colony.strengthUpgradeLevel + colony.pendingUpgrades.strength), maxLevel: 10 },
                    { type: 'speed', level: colony.speedUpgradeLevel + colony.pendingUpgrades.speed, cost: calculateUpgradeCost(colony.speedUpgradeLevel + colony.pendingUpgrades.speed), maxLevel: 5 }
                ];

                // Add interest upgrade to AI's consideration
                const currentInterestLevel = colony.interestUpgradeLevel + colony.pendingUpgrades.interest;
                if (currentInterestLevel < 5) { // Max level 5 for interest
                    possibleUpgrades.push({ type: 'interest', level: currentInterestLevel, cost: calculateUpgradeCost(currentInterestLevel, 15), maxLevel: 5 }); // Base cost 15 for interest
                }

                // Add artillery sub-upgrades if base artillery is owned (or pending)
                if (colony.hasArtillery || colony.pendingUpgrades.artillery) {
                    possibleUpgrades.push(
                        { type: 'artilleryFireRate', level: colony.artilleryFireRateLevel + colony.pendingUpgrades.artilleryFireRate, cost: calculateUpgradeCost(colony.artilleryFireRateLevel + colony.pendingUpgrades.artilleryFireRate), maxLevel: MAX_ARTILLERY_FIRE_RATE_LEVEL },
                        { type: 'artilleryAreaSize', level: colony.artilleryAreaSizeLevel + colony.pendingUpgrades.artilleryAreaSize, cost: calculateUpgradeCost(colony.artilleryAreaSizeLevel + colony.pendingUpgrades.artilleryAreaSize), maxLevel: MAX_ARTILLERY_AREA_SIZE_LEVEL }
                    );
                }
                // Add artillery focus upgrade if priority is owned
                if (colony.hasArtilleryPriority) {
                    possibleUpgrades.push(
                        { type: 'artilleryFocus', level: colony.artilleryFocusLevel + colony.pendingUpgrades.artilleryFocus, cost: calculateUpgradeCost(colony.artilleryFocusLevel + colony.pendingUpgrades.artilleryFocus), maxLevel: MAX_ARTILLERY_FOCUS_LEVEL }
                    );
                }

                const affordableUpgrades = possibleUpgrades.filter(upg => upg.level < upg.maxLevel && colony.gold >= upg.cost);

                if (affordableUpgrades.length === 0) {
                    canAffordAnUpgrade = false; break;
                }
                affordableUpgrades.sort((a, b) => a.cost - b.cost); // Simple AI: buy cheapest
                const bestUpgradeToBuy = affordableUpgrades[0];
                colony.gold -= bestUpgradeToBuy.cost;
                if (bestUpgradeToBuy.type === 'food') colony.pendingUpgrades.food++;
                else if (bestUpgradeToBuy.type === 'pixel') colony.pendingUpgrades.pixel++;
                else if (bestUpgradeToBuy.type === 'focus') colony.pendingUpgrades.focus++;
                else if (bestUpgradeToBuy.type === 'strength') colony.pendingUpgrades.strength++;
                else if (bestUpgradeToBuy.type === 'speed') colony.pendingUpgrades.speed++;
                else if (bestUpgradeToBuy.type === 'artilleryFireRate') colony.pendingUpgrades.artilleryFireRate++;
                else if (bestUpgradeToBuy.type === 'artilleryAreaSize') colony.pendingUpgrades.artilleryAreaSize++;
                else if (bestUpgradeToBuy.type === 'artilleryFocus') colony.pendingUpgrades.artilleryFocus++; // AI purchase logic
                else if (bestUpgradeToBuy.type === 'interest') colony.pendingUpgrades.interest++; // AI interest purchase
                
                console.log(`AI Colony ${colony.color} queued ${bestUpgradeToBuy.type} upgrade. Gold remaining: ${colony.gold}`);
            }
        }
    });
}

function runAIPrioritySetting() {
    console.log("Running AI Priority Setting...");
    colonies.forEach((colony, index) => {
        if (colony.isAI && !colony.isDefeated) {
            const priorities = ['food', 'gold', 'pixel'];
            const chosenPriority = priorities[getRandomInt(priorities.length)];
            setColonyPriority(index, chosenPriority);
            console.log(`AI Colony ${colony.color} set priority to ${chosenPriority}`);
        }
    });
}

function initializeGameSetup() {
    console.log("initializeGameSetup function called."); // Log 3
    const numPlayersInput = document.getElementById('numPlayersInput');
    const numHumanPlayers = parseInt(numPlayersInput.value);

    if (isNaN(numHumanPlayers) || numHumanPlayers < 1 || numHumanPlayers > 4) {
        alert("Please enter a valid number of players (1-4).");
        return;
    }

    // Reset all colonies
    colonies.forEach((colony, index) => {
        colony.pixels = [];
        colony.gold = 0; // All players start with 0 gold
        colony.upgradeLevel = 0;
        colony.pixelUpgradeLevel = 0;
        colony.focusUpgradeLevel = 0;
        colony.strengthUpgradeLevel = 0;
        colony.speedUpgradeLevel = 0;
        colony.hasArtillery = false;
        colony.artilleryFireRateLevel = 0; // Initialize new level
        colony.artilleryAreaSizeLevel = 0; // Initialize new level
        colony.hasArtilleryPriority = false; // Initialize new property
        colony.artilleryTargetIndex = -1; // Initialize targeting
        colony.artilleryFocusLevel = 0; // Initialize focus level
        colony.priority = 'food';
        colony.interestUpgradeLevel = 0; // NEW: For gold interest
        colony.pendingUpgrades = { food: 0, pixel: 0, focus: 0, strength: 0, speed: 0, artillery: false, artilleryFireRate: 0, artilleryAreaSize: 0, artilleryFocus: 0, interest: 0 }; // Initialize pending with focus AND interest
        colony.isDefeated = false;
    });

    // Set AI flags
    for (let i = 0; i < 4; i++) {
        colonies[i].isAI = (i >= numHumanPlayers);
    }

    console.log("Colony AI setup:", colonies.map(c => ({color: c.color, isAI: c.isAI })));

    document.getElementById('startupScreen').style.display = 'none';
    document.getElementById('gameContent').style.display = 'flex';

    gameHasStartedOnce = false;
    resetGame(); // Start first round
    console.log("initializeGameSetup finished."); // Log 4
}

// This function now populates the MODAL instead of corner panels
function populateUpgradeModalContent(colonyIndex) {
    const colony = colonies[colonyIndex];
    if (!colony || colony.isAI) {
        closeUpgradeModal();
        return;
    }

    document.getElementById('modalColonyName').textContent = `${colony.color.toUpperCase()} Colony Upgrades`;
    document.getElementById('modalColonyGold').textContent = colony.gold;
    
    const modalUpgradeButtonsContainer = document.getElementById('modalUpgradeButtonsContainer');
    modalUpgradeButtonsContainer.innerHTML = '';

    const hasArtilleryActiveOrPending = colony.hasArtillery || colony.pendingUpgrades.artillery;
    const hasArtilleryPriorityActiveOrPending = colony.hasArtilleryPriority || colony.pendingUpgrades.artilleryPriority;

    let upgradeTypes = [
        { type: 'food', name: 'Food Boost', currentEffectiveLevel: colony.upgradeLevel + colony.pendingUpgrades.food, maxLevel: 10, effect: 'Increases pixels spawned per food.' },
        { type: 'pixel', name: 'Pixel Boost', currentEffectiveLevel: colony.pixelUpgradeLevel + colony.pendingUpgrades.pixel, maxLevel: 10, effect: 'Increases starting pixels.' },
        { type: 'focus', name: 'Focus Boost', currentEffectiveLevel: colony.focusUpgradeLevel + colony.pendingUpgrades.focus, maxLevel: 10, effect: `Reduces random moves by ${colony.focusUpgradeLevel + colony.pendingUpgrades.focus}.` },
        { type: 'strength', name: 'Strength Boost', currentEffectiveLevel: colony.strengthUpgradeLevel + colony.pendingUpgrades.strength, maxLevel: 10, effect: `Increases pixel strength by ${colony.strengthUpgradeLevel + colony.pendingUpgrades.strength}.` },
        { type: 'speed', name: 'Speed Boost', currentEffectiveLevel: colony.speedUpgradeLevel + colony.pendingUpgrades.speed, maxLevel: 5, effect: `Reduces move interval by ${(colony.speedUpgradeLevel + colony.pendingUpgrades.speed) * 10}ms (${100 - ((colony.speedUpgradeLevel + colony.pendingUpgrades.speed) * 10)}ms total).` },
        { type: 'artillery', name: 'Artillery', currentEffectiveLevel: hasArtilleryActiveOrPending ? 1 : 0, maxLevel: 1, cost: 50, effect: 'Fires a shell every 5s. Unlocks further artillery upgrades.' },
        { type: 'interest', name: 'Gold Interest', currentEffectiveLevel: colony.interestUpgradeLevel + colony.pendingUpgrades.interest, maxLevel: 5, effect: 'Increases gold earned from interest each round.' } // NEW INTEREST UPGRADE
    ];

    if (hasArtilleryActiveOrPending) {
        const currentFireRateLevel = colony.artilleryFireRateLevel + colony.pendingUpgrades.artilleryFireRate;
        const currentFireRateMs = 5000 - currentFireRateLevel * 500;
        upgradeTypes.push({ 
            type: 'artilleryFireRate', 
            name: 'Artillery Fire Rate', 
            currentEffectiveLevel: currentFireRateLevel, 
            maxLevel: MAX_ARTILLERY_FIRE_RATE_LEVEL, 
            effect: `Fires every ${(currentFireRateMs / 1000).toFixed(1)}s.` 
        });

        const currentAreaSizeLevel = colony.artilleryAreaSizeLevel + colony.pendingUpgrades.artilleryAreaSize;
        // Calculate internal diameter
        const internalDiameter = BASE_ARTILLERY_DIAMETER + currentAreaSizeLevel * ARTILLERY_DIAMETER_INCREASE_PER_LEVEL; 
        // Calculate VISUAL diameter for display
        const visualDiameter = Math.round(internalDiameter * 3);
        upgradeTypes.push({ 
            type: 'artilleryAreaSize', 
            name: 'Artillery Area Size', 
            currentEffectiveLevel: currentAreaSizeLevel, 
            maxLevel: MAX_ARTILLERY_AREA_SIZE_LEVEL, // Use new MAX level (6)
            effect: `Impact diameter ~${visualDiameter}px visually.` // Text reflects visual size
        });

        // Add Artillery Priority upgrade if base artillery is owned/pending
        upgradeTypes.push({
            type: 'artilleryPriority',
            name: 'Artillery Priority',
            currentEffectiveLevel: hasArtilleryPriorityActiveOrPending ? 1 : 0,
            maxLevel: 1,
            cost: ARTILLERY_PRIORITY_COST,
            effect: 'Unlocks artillery targeting options & focus upgrade.'
        });

        // Add Artillery Focus upgrade if Artillery Priority is owned
        if (colony.hasArtilleryPriority) {
            const currentFocusLevel = colony.artilleryFocusLevel + colony.pendingUpgrades.artilleryFocus;
            // Calculate internal randomness, ensuring minimum
            const internalRandomness = Math.max(MIN_ARTILLERY_RANDOMNESS, BASE_ARTILLERY_RANDOMNESS - currentFocusLevel * ARTILLERY_RANDOMNESS_REDUCTION);
            // Calculate VISUAL randomness for display
            const visualRandomness = Math.round(internalRandomness * 3); 
            upgradeTypes.push({
                type: 'artilleryFocus',
                name: 'Artillery Focus',
                currentEffectiveLevel: currentFocusLevel,
                maxLevel: MAX_ARTILLERY_FOCUS_LEVEL,
                effect: `Reduces targeting scatter radius to ~${visualRandomness}px visually.` // Updated effect text
            });
        }
    }

    upgradeTypes.forEach(upg => {
        const isBaseArtillery = upg.type === 'artillery';
        const isArtilleryPriority = upg.type === 'artilleryPriority';
        const isArtillerySub = ['artilleryFireRate', 'artilleryAreaSize', 'artilleryFocus'].includes(upg.type);
        
        let cost = 0;
        if (isBaseArtillery) cost = upg.cost; // Should be from upg object if defined, e.g., 50
        else if (isArtilleryPriority) cost = upg.cost; // Should be from upg object, e.g., ARTILLERY_PRIORITY_COST (25)
        else if (upg.type === 'interest') {
            cost = calculateUpgradeCost(upg.currentEffectiveLevel, 15); // Interest upgrade with base cost 15
        } else {
            cost = calculateUpgradeCost(upg.currentEffectiveLevel); // Default base cost (5)
        }

        const button = document.createElement('button');
        const levelText = (isBaseArtillery || isArtilleryPriority) ? (upg.currentEffectiveLevel >= 1 ? ' (Active)' : ' (Inactive)') : ` - Lvl ${upg.currentEffectiveLevel}`;
        
        button.innerText = `${upg.name} ($${cost})${levelText}`;
        button.title = `Cost: ${cost} Gold. ${upg.effect}`.trim();
        if (!isBaseArtillery && !isArtilleryPriority) {
            button.title = `Cost: ${cost} Gold. Current Lvl (incl. pending): ${upg.currentEffectiveLevel}. ${upg.effect}`.trim();
        }

        button.onclick = () => buyUpgrade(colonyIndex, upg.type, true);
        
        let disabled = upg.currentEffectiveLevel >= upg.maxLevel || colony.gold < cost;
        // Sub-artillery upgrades (rate, area) also require base artillery to be active or pending
        if (['artilleryFireRate', 'artilleryAreaSize'].includes(upg.type) && !hasArtilleryActiveOrPending) {
            disabled = true;
        }
        // Artillery Priority requires base artillery
        if (isArtilleryPriority && !hasArtilleryActiveOrPending) {
            disabled = true;
        }
        // Artillery Focus requires Artillery Priority
        if (upg.type === 'artilleryFocus' && !colony.hasArtilleryPriority) {
            disabled = true;
        }
        button.disabled = disabled;
                          
        modalUpgradeButtonsContainer.appendChild(button);
    });
}

function openUpgradeModal(colonyIndex) {
    currentModalColonyIndex = colonyIndex; // Store which colony's modal is open
    populateUpgradeModalContent(colonyIndex);
    document.getElementById('upgradeModal').style.display = 'flex';
}

function closeUpgradeModal() {
    currentModalColonyIndex = -1;
    document.getElementById('upgradeModal').style.display = 'none';
}

// --- Priority Modal Functions ---
function openPriorityModal(colonyIndex) {
    currentPriorityModalColonyIndex = colonyIndex;
    const colony = colonies[colonyIndex];
    if (!colony || colony.isAI) return; // Should not be callable for AI from UI

    document.getElementById('priorityModalTitle').textContent = `Set Pixel Focus for ${colony.color.toUpperCase()} Colony`;
    populatePriorityModalContent(colonyIndex);
    document.getElementById('priorityModal').style.display = 'flex';
}

function populatePriorityModalContent(colonyIndex) {
    const colony = colonies[colonyIndex];
    const priorityModalButtonsContainer = document.getElementById('priorityModalButtonsContainer');
    priorityModalButtonsContainer.innerHTML = ''; // Clear old buttons

    const priorities = [
        { type: 'food', name: 'Food Priority', description: 'Pixels will target the nearest Food tile.' },
        { type: 'gold', name: 'Gold Priority', description: 'Pixels will target the nearest Gold tile.' },
        { type: 'pixel', name: 'Pixel Priority', description: 'Pixels will target the nearest enemy Pixel.' }
    ];

    priorities.forEach(pTypeInfo => {
        const button = document.createElement('button');
        button.textContent = pTypeInfo.name;
        button.title = pTypeInfo.description;
        button.dataset.priorityType = pTypeInfo.type;
        button.onclick = () => handlePrioritySelectionFromModal(pTypeInfo.type);
        if (colony.priority === pTypeInfo.type) {
            button.classList.add('active-priority'); // Reuse existing class or create a new one for modal
        }
        priorityModalButtonsContainer.appendChild(button);
    });
}

function handlePrioritySelectionFromModal(priorityType) {
    if (currentPriorityModalColonyIndex === -1) return;
    setColonyPriority(currentPriorityModalColonyIndex, priorityType);
    // No need to explicitly close, user can make multiple changes or close manually.
    // populatePriorityModalContent will be called by setColonyPriority if modal is still open.
}

function closePriorityModal() {
    currentPriorityModalColonyIndex = -1;
    document.getElementById('priorityModal').style.display = 'none';
}

// --- Artillery Targeting Modal Functions ---
function openArtilleryTargetingModal(colonyIndex) {
    currentArtilleryTargetingModalColonyIndex = colonyIndex;
    const colony = colonies[colonyIndex];
    if (!colony || colony.isAI || !colony.hasArtilleryPriority) return; // Safety checks

    document.getElementById('artilleryTargetingModalTitle').textContent = `Set Artillery Target for ${colony.color.toUpperCase()} Colony`;
    populateArtilleryTargetingModalContent(colonyIndex);
    document.getElementById('artilleryTargetingModal').style.display = 'flex';
}

function populateArtilleryTargetingModalContent(colonyIndex) {
    const colony = colonies[colonyIndex];
    const artilleryTargetingModalButtonsContainer = document.getElementById('artilleryTargetingModalButtonsContainer');
    artilleryTargetingModalButtonsContainer.innerHTML = ''; // Clear old buttons

    // Option to target randomly
    const randomButton = document.createElement('button');
    randomButton.textContent = 'Target All (Random)';
    randomButton.title = 'Artillery will strike random locations as before.';
    randomButton.dataset.targetIndex = '-1'; // Use -1 to indicate random targeting
    randomButton.onclick = () => handleArtilleryTargetSelection(-1); 
    // TODO: Add styling to show if this is the current selection
    if (colony.artilleryTargetIndex === -1) { // Check if this is the current target
        randomButton.classList.add('active-priority'); // Reuse style from pixel priority modal
    }
    artilleryTargetingModalButtonsContainer.appendChild(randomButton);

    // Add buttons for each active enemy colony
    colonies.forEach((enemyColony, enemyIndex) => {
        if (enemyIndex === colonyIndex || enemyColony.isDefeated) return; // Skip self and defeated

        const button = document.createElement('button');
        button.textContent = `Target ${enemyColony.color.toUpperCase()} Colony`;
        button.title = `Prioritize targeting ${enemyColony.color}\'s area.`;
        button.dataset.targetIndex = enemyIndex.toString();
        button.onclick = () => handleArtilleryTargetSelection(enemyIndex);
        // TODO: Add styling to show if this is the current selection
        // TODO: Add logic to show the currently selected target
        if (colony.artilleryTargetIndex === enemyIndex) { // Check if this is the current target
            button.classList.add('active-priority');
        }
        artilleryTargetingModalButtonsContainer.appendChild(button);
    });
}

function handleArtilleryTargetSelection(targetIndex) {
    if (currentArtilleryTargetingModalColonyIndex === -1) return;
    
    const attackingColony = colonies[currentArtilleryTargetingModalColonyIndex];
    if (!attackingColony) return;

    // 1. Set the target index on the attacking colony object
    attackingColony.artilleryTargetIndex = targetIndex; 

    // 2. Log the action
    console.log(`Colony ${attackingColony.color} artillery target set to index: ${targetIndex}`);
    
    // 3. Refresh the modal content to show the new active selection
    populateArtilleryTargetingModalContent(currentArtilleryTargetingModalColonyIndex);
    
    // Optionally close the modal after selection, or leave it open
    // closeArtilleryTargetingModal(); 
}

function closeArtilleryTargetingModal() {
    currentArtilleryTargetingModalColonyIndex = -1;
    document.getElementById('artilleryTargetingModal').style.display = 'none';
}

function visualizeArtilleryImpact(centerX, centerY, maxRadius) {
    let currentRadius = 0;
    const steps = 10;
    const expansionRate = maxRadius / steps;
    const duration = 250; // Slightly longer duration
    const intervalTime = duration / steps;
    let currentStep = 0;

    const impactInterval = setInterval(() => {
        currentStep++;
        // Calculate area to redraw based on the *next* radius to ensure clearing before drawing
        const redrawRadius = currentRadius + expansionRate;
        const redrawX = centerX - redrawRadius;
        const redrawY = centerY - redrawRadius;
        const redrawDiameter = redrawRadius * 2;
        redrawArea(redrawX, redrawY, redrawDiameter, redrawDiameter); // Redraw area first

        currentRadius += expansionRate;
        if (currentRadius > maxRadius) {
            currentRadius = maxRadius;
        }

        const opacity = 0.7 * (1 - (currentStep / steps)); // Fade out based on steps
        ctx.beginPath();
        ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 69, 0, ${opacity})`; // OrangeRed with calculated opacity
        ctx.fill();

        if (currentStep >= steps) {
            clearInterval(impactInterval);
            // Final redraw slightly delayed to ensure animation clears
            setTimeout(() => {
                const finalRedrawX = centerX - maxRadius;
                const finalRedrawY = centerY - maxRadius;
                const finalRedrawDiameter = maxRadius * 2;
                redrawArea(finalRedrawX, finalRedrawY, finalRedrawDiameter, finalRedrawDiameter);
            }, 50);
        }
    }, intervalTime);
}

function redrawArea(x, y, width, height) {
    // Clamp redraw area to canvas bounds
    const drawX = Math.max(0, Math.floor(x));
    const drawY = Math.max(0, Math.floor(y));
    const drawWidth = Math.min(canvas.width - drawX, Math.ceil(width + (x - drawX)));
    const drawHeight = Math.min(canvas.height - drawY, Math.ceil(height + (y - drawY)));

    if (drawWidth <= 0 || drawHeight <= 0) return; // Nothing to redraw

    ctx.clearRect(drawX, drawY, drawWidth, drawHeight);
    // Redraw food/gold tiles
    foodTiles.forEach(tile => {
        if (tile.x >= drawX && tile.x < drawX + drawWidth && tile.y >= drawY && tile.y < drawY + drawHeight) {
            drawPixel(tile.x, tile.y, 'white');
        }
    });
    goldTiles.forEach(tile => {
        if (tile.x >= drawX && tile.x < drawX + drawWidth && tile.y >= drawY && tile.y < drawY + drawHeight) {
            drawPixel(tile.x, tile.y, 'yellow');
        }
    });
    // Redraw pixels
    colonies.forEach(colony => {
        if (!colony.isDefeated) {
            colony.pixels.forEach(pixel => {
                if (pixel.x >= drawX && pixel.x < drawX + drawWidth && pixel.y >= drawY && pixel.y < drawY + drawHeight) {
                    drawPixel(pixel.x, pixel.y, colony.color);
                }
            });
        }
    });
}

function startArtilleryFiring(colonyIndex) {
    const colony = colonies[colonyIndex];
    if (!colony || !colony.hasArtillery) return; 

    // Clear any existing interval for this colony before starting a new one
    if (artilleryIntervals[colonyIndex]) {
        clearInterval(artilleryIntervals[colonyIndex]);
    }
    // Calculate fire rate based on upgrade level
    const fireRate = Math.max(1000, 5000 - colony.artilleryFireRateLevel * 500);
    
    artilleryIntervals[colonyIndex] = setInterval(() => {
        // Ensure the colony hasn't been defeated in the meantime
        if (!colony.isDefeated && colony.hasArtillery) {
            fireArtillery(colonyIndex);
        }
    }, fireRate);
    
    console.log(`Colony ${colony.color} artillery firing started (Rate: ${fireRate}ms, Interval ID: ${artilleryIntervals[colonyIndex]})`);
}

function fireArtillery(colonyIndex) {
    const colony = colonies[colonyIndex];
    if (!colony || colony.isDefeated || !colony.hasArtillery) {
        if (artilleryIntervals[colonyIndex]) clearInterval(artilleryIntervals[colonyIndex]); 
        artilleryIntervals[colonyIndex] = null;
        return;
    }

    // Calculate area size (diameter) and radius based on level (using INTERNAL units)
    const areaDiameter = BASE_ARTILLERY_DIAMETER + colony.artilleryAreaSizeLevel * ARTILLERY_DIAMETER_INCREASE_PER_LEVEL; // Uses new constants
    const maxRadius = areaDiameter / 2;
    const radiusSquared = maxRadius * maxRadius; 
    
    let centerX, centerY;

    // --- Determine Target Location --- 
    const targetIndex = colony.artilleryTargetIndex;
    let targetColony = null;
    // Check if targetIndex is valid, target colony exists, is not defeated, and has pixels
    if (targetIndex >= 0 && targetIndex < colonies.length && colonies[targetIndex] && !colonies[targetIndex].isDefeated && colonies[targetIndex].pixels.length > 0) {
        targetColony = colonies[targetIndex];
    }

    if (targetColony) {
        // Target a specific colony: pick a random pixel from that colony as initial center
        const targetPixel = targetColony.pixels[getRandomInt(targetColony.pixels.length)];
        centerX = targetPixel.x;
        centerY = targetPixel.y;
        console.log(`[DEBUG] Initial target: ${targetColony.color} pixel at (${centerX}, ${centerY})`); // Log 1: Initial Pixel
        
        // --- Apply Randomness Radius based on Focus Level --- 
        const focusLevel = colony.artilleryFocusLevel; // Get current focus level
        const randomnessRadius = Math.max(MIN_ARTILLERY_RANDOMNESS, BASE_ARTILLERY_RANDOMNESS - focusLevel * ARTILLERY_RANDOMNESS_REDUCTION); // Use new constants and min
        // console.log(`[DEBUG] Attacker: ${colony.color}, Focus Level: ${focusLevel}, Scatter Radius (Internal): ${randomnessRadius.toFixed(0)}`); // Adjusted Log
        
        // Apply offset only if randomness is above minimum threshold
        if (randomnessRadius > MIN_ARTILLERY_RANDOMNESS) { 
            const angle = Math.random() * 2 * Math.PI;
            const radiusOffset = Math.random() * randomnessRadius; // Random distance within the radius
            const offsetX = Math.cos(angle) * radiusOffset;
            const offsetY = Math.sin(angle) * radiusOffset;
            
            const initialTargetX = centerX; // Store for logging
            const initialTargetY = centerY;

            // Apply the offset
            centerX += offsetX;
            centerY += offsetY;
            
            // Clamp final centerX/Y to canvas bounds
            centerX = Math.max(0, Math.min(canvas.width - 1, Math.round(centerX)));
            centerY = Math.max(0, Math.min(canvas.height - 1, Math.round(centerY)));
            
            // console.log(`ARTILLERY: ${colony.color} targeting ${targetColony.color} near (${initialTargetX}, ${initialTargetY}) with ${randomnessRadius.toFixed(0)}px scatter -> (${centerX}, ${centerY})`);
            console.log(`[DEBUG] Final Impact Point (after scatter): (${centerX}, ${centerY})`); // Log 3: Final Coords
        } else {
             // At minimum randomness, target directly (or very close)
             console.log(`[DEBUG] Final Impact Point (Min Scatter ~${Math.round(MIN_ARTILLERY_RANDOMNESS * 3)}px): (${centerX}, ${centerY})`); // Log 3: Final Coords (Min Scatter)
        }
        // --- End Randomness Radius ---

    } else {
        // Target is invalid or set to Random (-1): Fire randomly on canvas
        centerX = getRandomInt(canvas.width);
        centerY = getRandomInt(canvas.height);
        if (targetIndex !== -1) {
            // Log if the target was explicitly set but invalid
            console.log(`ARTILLERY: ${colony.color} target index ${targetIndex} invalid (defeated/no pixels?), firing randomly.`);
        }
    }
    // --- End Target Location Determination ---

    visualizeArtilleryImpact(centerX, centerY, maxRadius); // Pass calculated center and radius

    // --- Destroy Pixels (Circular Check) --- 
    let pixelsDestroyed = 0;
    colonies.forEach((colonyToDamage) => { // Renamed variable for clarity
        // Skip the attacking colony if friendly fire is off (currently it's always on)
        // if (colonyToDamage === colony) return; 

        for (let i = colonyToDamage.pixels.length - 1; i >= 0; i--) {
            const pixel = colonyToDamage.pixels[i];
            const distanceSquared = Math.pow(pixel.x - centerX, 2) + Math.pow(pixel.y - centerY, 2);
            if (distanceSquared <= radiusSquared) {
                drawPixel(pixel.x, pixel.y, 'black'); // Clear visually
                colonyToDamage.pixels.splice(i, 1); // Remove from game state
                pixelsDestroyed++;
            }
        }
    });

    // --- Destroy Food (Circular Check) --- 
    let foodDestroyed = 0;
    for (let i = foodTiles.length - 1; i >= 0; i--) {
        const tile = foodTiles[i];
        const distanceSquared = Math.pow(tile.x - centerX, 2) + Math.pow(tile.y - centerY, 2);
        if (distanceSquared <= radiusSquared) {
            drawPixel(tile.x, tile.y, 'black');
            foodTiles.splice(i, 1);
            foodDestroyed++;
        }
    }

    // --- Destroy Gold (Circular Check) --- 
    let goldDestroyed = 0;
    for (let i = goldTiles.length - 1; i >= 0; i--) {
        const tile = goldTiles[i];
        const distanceSquared = Math.pow(tile.x - centerX, 2) + Math.pow(tile.y - centerY, 2);
        if (distanceSquared <= radiusSquared) {
            drawPixel(tile.x, tile.y, 'black');
            goldTiles.splice(i, 1);
            goldDestroyed++;
        }
    }

    if (pixelsDestroyed > 0 || foodDestroyed > 0 || goldDestroyed > 0) {
        // console.log(`ARTILLERY: Destroyed ${pixelsDestroyed} pixels, ${foodDestroyed} food, ${goldDestroyed} gold.`);
    }

    // Check for newly defeated colonies AFTER destruction phase
    let potentiallyGameOver = false;
    colonies.forEach((colonyToCheck, indexToCheck) => {
        if (!colonyToCheck.isDefeated && colonyToCheck.pixels.length === 0) {
            colonyToCheck.isDefeated = true;
            console.log(`${colonyToCheck.color.toUpperCase()} COLONY HAS BEEN ELIMINATED BY ARTILLERY!`);
            // Clear intervals for the defeated colony
            if (colonyIntervals[indexToCheck]) {
                 clearInterval(colonyIntervals[indexToCheck]);
                 colonyIntervals[indexToCheck] = null;
            }
            if (artilleryIntervals[indexToCheck]) {
                 clearInterval(artilleryIntervals[indexToCheck]);
                 artilleryIntervals[indexToCheck] = null;
            }
            potentiallyGameOver = true;
        }
    });

    // Update stats AFTER checking defeat, so UI reflects elimination
    updateColonyStats();

    if (potentiallyGameOver) {
        console.log("ARTILLERY: Checking win condition after potential elimination.");
        checkWinCondition();
    }
}
