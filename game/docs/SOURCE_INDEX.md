# 源码索引（自动生成）

执行 `npm run ai:index` 更新。导入为文本提取；导出仅列具名声明，不含重导出清单或完整 API。完整原文以源码为准。

| 文件 | 行数 | 字节 | 具名导出声明 |
| --- | ---: | ---: | --- |
| [src/app/bootstrap.js](../src/app/bootstrap.js) | 373 | 18251 | — |
| [src/app/game.js](../src/app/game.js) | 1534 | 70212 | Game |
| [src/app/settings.js](../src/app/settings.js) | 54 | 1916 | applyAll, update, get, preview |
| [src/core/appraise.js](../src/core/appraise.js) | 206 | 7913 | appraise, revealSteps |
| [src/core/arena.js](../src/core/arena.js) | 386 | 17061 | baseFaces, createMatch, currentEvent, choose, fieldTestTask, submitFieldTest, submitFieldTestChallenge, skipFieldTest, finalFaces, momentumName |
| [src/core/arenaCareerV41.js](../src/core/arenaCareerV41.js) | 47 | 2057 | CAREER_VERSION, makeCareerV41, normalizeCareerV41, recoverCareerMatch, validateCareerCheckpoint |
| [src/core/arenaChallenge.js](../src/core/arenaChallenge.js) | 872 | 51145 | FORMAL_RISK_TBD, CHALLENGE_SECONDS, MATERIALS, SAMPLE_MATERIALS, ROUTES, FINALES, createChallenge, restartChallenge, chooseAugment, tick, chooseRoute, chooseFinale, beginSwipe, hasStructuralFailure, swipe, finish, setPaused |
| [src/core/arenaCutBridge.js](../src/core/arenaCutBridge.js) | 49 | 2468 | advanceArenaClock, formalCutPayload |
| [src/core/arenaEncounters.js](../src/core/arenaEncounters.js) | 92 | 4740 | MATERIAL_ORDER, PHASES, PHASE_DURATION, createEncounter, encounterPhase, phaseMaterialPool, selectEncounterMaterial, phaseQuota, stageSpawnInterval |
| [src/core/arenaFormal.js](../src/core/arenaFormal.js) | 701 | 30443 | FORMAL_MATCH_VERSION, validateApexRoster, createFormalMatch, currentTest, testTask, submitTest, abandon, finishMatch, APEX_ROUNDS, createApexMatch, apexAvailable, apexDispatch, apexSubmit, apexRetryRound, finishApex, NATIONAL_ROUNDS_FORMAL, createNationalMatch, nationalCurrentRound, nationalStartRound, nationalSubmit, nationalAbandon, finishNational |
| [src/core/arenaPerformance.js](../src/core/arenaPerformance.js) | 308 | 13000 | TEST_TYPES, PROTOTYPE_INPUT, createPerformance, beginOperation, moveOperation, tickOperation, endOperation, interruptOperation, pauseOperation, resetOperation, diagnoseCut |
| [src/core/arenaSlice.js](../src/core/arenaSlice.js) | 342 | 14959 | SLICE_SECONDS, GHOST_BASE, WIN_STREAK_CAP, winStreakFactorOf, createSliceMatch, ghostOf, availableBlades, dispatchBlade, pickBuff, startRun, finishRun, nextRun, forfeitRound, currentParams |
| [src/core/arenaStructures.js](../src/core/arenaStructures.js) | 153 | 8686 | STRUCTURE_VERSION, STRUCTURE_TEMPLATES, createStructure, updateStructure, structureScore, structureSnapshot |
| [src/core/arenaSuite.js](../src/core/arenaSuite.js) | 104 | 5927 | DEFAULT_FORMAL_TESTS, FORMAL_TEST_NAMES, SUITE_POLICY, createSuite, currentSuiteTest, startSuite, addCutDiagnostic, captureCut, recordSuiteOperation, advanceSuite, suiteSummary, submitSuite, annotateAbandonedSuite |
| [src/core/arenaTeam.js](../src/core/arenaTeam.js) | 245 | 10777 | validateRoster, createTeam, dispatchBlade, currentMatch, teamResult, completeRound |
| [src/core/arenaV41Growth.js](../src/core/arenaV41Growth.js) | 109 | 5270 | XP_THRESHOLDS, WORKSHOP_TIERS, workshopLevel, workshopSnapshot, makeWorkshopV41, normalizeWorkshopV41, awardWorkshopXp, rarityMultiplier, discountedRerollCost, effectiveRiskScale, migrateVerifiedLegacyGrowth |
| [src/core/arenaV41Rewards.js](../src/core/arenaV41Rewards.js) | 50 | 2324 | SCHOOL_CR, SCHOOL_XP, SCHOOL_FIRST_CR, SCHOOL_FIRST_XP, isV41Match, effectivePrimary, careerRewardPlan |
| [src/core/arenaV41Specialties.js](../src/core/arenaV41Specialties.js) | 112 | 6337 | SPECIALTIES, BY_BONUS, specialtyLevel, validStatStages, normalizeSpecialtyOptions, specialtySnapshot, matchSpecialtyCard, activeRollSpecialty, noteSafeRisk, specialtyTierExplanation, specialtyFlowCue |
| [src/core/attributes.js](../src/core/attributes.js) | 53 | 1425 | make, apply, mean, total, clone, faceMean |
| [src/core/bladeAdapter.js](../src/core/bladeAdapter.js) | 266 | 11150 | knifeProfile, resolveTraitEffects, adaptBlade, legacyStatsOf, projectCapabilityMean |
| [src/core/bladeMastery.js](../src/core/bladeMastery.js) | 102 | 4621 | MASTERY_LEVELS, selectBladeSpecialty, normalizeBladeMastery, masteryView, qualifyingFormalMatch, verifiedApexBladeRounds, creditBladeMastery |
| [src/core/cards.js](../src/core/cards.js) | 186 | 8445 | CANDIDATE_COUNT, UNLOCKED_WEIGHT_BOOST, rollCandidates, reroll, nextRerollCost, previewPick, commit |
| [src/core/combos.js](../src/core/combos.js) | 69 | 2650 | evaluate, discovered, hintOf |
| [src/core/cutParams.js](../src/core/cutParams.js) | 157 | 6712 | foldBuffMods, deriveCutParams, deriveCutParamsForBlade, describeParams |
| [src/core/daily.js](../src/core/daily.js) | 107 | 4001 | dayKey, seedOfDay, modifierOfDay, dailyPayload, makeTaskState, completeTask, allDone, recordScore |
| [src/core/economy.js](../src/core/economy.js) | 38 | 1372 | startCr, addCr, canAfford, forgeReward, matchReward, rerollPrice |
| [src/core/edge.js](../src/core/edge.js) | 380 | 16673 | shapeOf, baseline, makeTask, normalizeSamples, evaluate, accuracy, projectedQuality, tierOf, contourPreview, resultView, submit, autoPlay |
| [src/core/events.js](../src/core/events.js) | 213 | 8193 | EVENT, makeEventLedger, eventIdOf, settle, bumpDailyStreak, applyUnlockToken |
| [src/core/forge.js](../src/core/forge.js) | 336 | 13353 | PHASE, createRun, stageDef, confirmCard, hammerStrike, endHammer, submitEdge, snapshot |
| [src/core/forgeAssist.js](../src/core/forgeAssist.js) | 33 | 1387 | ASSISTED_STAGES, MANUAL_STAGES, isAssistedStage, assistedCard |
| [src/core/forgeBonuses.js](../src/core/forgeBonuses.js) | 157 | 5686 | makeRunBonus, unlockStateOf, bonusListFor, equipBonus, lockBonus, canUse, use, effectOf, snapshot |
| [src/core/forgeChapters.js](../src/core/forgeChapters.js) | 59 | 3619 | FORGE_FLOW_VERSION, FORGE_CHAPTERS, isFiveScreen, chapterOf, chapterState, forgeStageStatDelta |
| [src/core/forgeMaterials.js](../src/core/forgeMaterials.js) | 78 | 3775 | makeMaterialsV1, normalizeMaterialsV1, stockedCount, materialDropFor, grantMaterial, spendMaterialInDraft |
| [src/core/forgeRecipeAccess.js](../src/core/forgeRecipeAccess.js) | 56 | 3015 | RECIPE_STAGES, guaranteedRecipes, selectableRecipes, pinRecipeChoice |
| [src/core/forgeShape.js](../src/core/forgeShape.js) | 27 | 1252 | SHAPE_VERSION, MAX_SHAPE_MARKS, normalizedShapeProfile, noteHammerShape |
| [src/core/forgeTraitCuts.js](../src/core/forgeTraitCuts.js) | 126 | 4987 | CUT_TRAIT_STYLES, resolveForgeCutTraits, applyForgeCutTraits |
| [src/core/hammer.js](../src/core/hammer.js) | 186 | 8059 | makeState, statGainOf, progressOf, nextRiskDelta, previewNextBreakChance, strike, end, traitFor, tierReward, tierName, toNextTier |
| [src/core/index.js](../src/core/index.js) | 73 | 2875 | playRun |
| [src/core/progress.js](../src/core/progress.js) | 1573 | 85268 | load, get, persist, spendForgeReroll, spendForgeMaterial, resetAll, settleQuickChallenge, quickChallengeRecords, archive, collection, fracturedList, bladeById, setShowcase, toggleFavorite, renameBlade, checkpointCareerV41, activeCareerV41, clearCareerV41, hasNationalCrownV41, unlockCodex, codexCount, codexTotal, codexProgress, checkAchievements, takeUnlockOut, addCr, fractureBlade, recordMatch, schoolProgress, isGradientUnlocked, normalizeTeamArena, activeTeamMatch, isTeamApexUnlocked, startTeamMatch, dispatchTeamBlade, updateTeamRound, completeTeamRound, forfeitUnavailableTeamBlade, settleTeamMatch, rolloverDaily, dailyState, equipForgeBonus, setSpecialtyOptions, forgeBonusView, updateSettings, nextGoal, homeSummary, NATIONAL_RUN_POLICY, normalizeNationalRuns, activeNationalRun, nationalRunById, startNationalRun, abandonNationalRun, hasLegacyNationalActive, beginNationalRound, NATIONAL_CHECKPOINT_POLICY, validateNationalCheckpoint, checkpointNationalRound, restoreNationalRound, flushNationalRound, updateNationalRound, completeNationalRound |
| [src/core/quickChallengeRecords.js](../src/core/quickChallengeRecords.js) | 56 | 3057 | makeQuickRecords, normalizeQuickRecords, quickChallengeKey, updateQuickRecord |
| [src/core/recipe.js](../src/core/recipe.js) | 429 | 22944 | DEFAULT_SKIN, visualCardOf, deriveSkinState, applyCardIdentity, deriveHandleMask |
| [src/core/risk.js](../src/core/risk.js) | 99 | 3915 | clamp, make, apply, after, breakChance, breakPercent, check, band, ladder |
| [src/core/saveSchema.js](../src/core/saveSchema.js) | 202 | 10356 | defaultSettings, normalizeSettings, makeSave, normalizeSave |
| [src/core/saveTransaction.js](../src/core/saveTransaction.js) | 14 | 608 | commitSave |
| [src/core/scoring.js](../src/core/scoring.js) | 169 | 7077 | computeScore, peakBandOf, resolveRarity, qualityOf, statProfile |
| [src/core/tags.js](../src/core/tags.js) | 108 | 3591 | makeLedger, record, undo, counts, stageSpread, baseTagTiers, specialTags, dominantBaseTag |
| [src/core/testScoring.js](../src/core/testScoring.js) | 238 | 9771 | TEST_SCORING_VERSION, createTestSession, currentTest, settleTest, advance, allComplete, aggregate, judge, targetScoreOf |
| [src/core/traits.js](../src/core/traits.js) | 191 | 6956 | registerLegacyTraits, isHighTrait, hasSameTagTrait, grant, pendingBaseTraits, settleBaseTraits, settleSpecialTags, evaluateConditional |
| [src/data/achievements.js](../src/data/achievements.js) | 71 | 5443 | ACHIEVEMENTS, ACHIEVEMENT_BY_ID, achievementsOfGroup, ACHIEVEMENT_GROUPS |
| [src/data/arena/branches.js](../src/data/arena/branches.js) | 67 | 2294 | GRADIENTS, BRANCHES, branchById, gradientAt, SCHOOL_RULES |
| [src/data/arena/buffs.js](../src/data/arena/buffs.js) | 131 | 8724 | BUFF_TIERS, BUFF_FAMILIES, BUFFS, BUILD_TAGS, resonanceOf, BUFF_BY_ID, rollBuffChoices |
| [src/data/arena/events.js](../src/data/arena/events.js) | 95 | 3708 | CHOICE_KINDS, EVENTS, EVENT_BY_ID, getEvent, pickEvents |
| [src/data/arena/formalTests.js](../src/data/arena/formalTests.js) | 43 | 3329 | FORMAL_RULES_VERSION, BRANCH_FORMATS, BRANCH_FORMAT_LIST, branchFormat, GRADIENT_RULES, gradientRule, PROJECT_RULES, projectRule, buildFormalDefinition, allBranchDefinitions |
| [src/data/arena/opponents.js](../src/data/arena/opponents.js) | 120 | 4697 | TENDENCIES, tendencyById, tendencyOfStats, makeBranchOpponent, makeTournamentOpponent, faceScores |
| [src/data/arena/team.js](../src/data/arena/team.js) | 12 | 329 | TEAM_POLICY |
| [src/data/arena/tournaments.js](../src/data/arena/tournaments.js) | 61 | 2115 | NATIONAL_ROUNDS, TIERS, tierById, THEMES, themeById, rollTheme |
| [src/data/balance.js](../src/data/balance.js) | 591 | 32067 | STAT_KEYS, STAT_META, STAT_SOFT_CAP, ARENA_V3, ARENA_STAT_CEILING, arenaStat, arenaGrowth, ARENA_POWER, ARENA_MATERIALS, STAT_CURVE, applyStatCurve, STAT_CURVE_CEILING, TEST_PROJECTS, TEST_REF, TEST_SCORE, testScoreOfRatio, TEST_WEIGHTS_DEFAULT, ARENA_TARGET_SCALE, CARD_STAT_SCALE, LEGACY_OPPONENT_SCALE, OPPONENT_STAT_SCALE, RISK_MAX, RISK_BANDS, BREAK_ANCHORS, HAMMER_RISK_STEPS, hammerRiskDelta, HAMMER_PROGRESS, HAMMER_TIERS, HAMMER_GAIN_SCALE, HAMMER_TIER_REWARD, EDGE_TIERS, EDGE_SHARP_CAP, CONTOUR_SAMPLES, CONTOUR_ATTEMPT_MULTIPLIERS, EDGE_TOLERANCE, EDGE_SAMPLES, EDGE_COVERAGE_MIN, EDGE_STABILITY_TOLERANCE, TAG_TIERS, TAG_MAX_EFFECTIVE_LAYERS, PEAK_RISK_MULT, RARITY_THRESHOLDS, COMBO_SCORE_MULT, QUALITY_THRESHOLDS, FACES, FACE_REF, MATCH_WEIGHTS, MOMENTUM, ARENA_EVENT_COUNT, FIELD_TESTS, FIELD_TEST_MAX_INFLUENCE, FIELD_TEST_MOMENTUM, ARENA_CAN_DESTROY_BLADE, CR_START, rerollCost, CR_REWARD, DAILY_TASKS, bandOfRisk, peakRiskMult, rarityOfScore, qualityOfMean, tagTierOf, hammerTierOf |
| [src/data/bladeEffects.js](../src/data/bladeEffects.js) | 158 | 10589 | ADAPTER_VERSION, EFFECT_VERSION, NO_TEST_EFFECT, KNIFE_PROFILES, KNIFE_PROFILE_FALLBACK, TRAIT_TEST_MODS, LEGACY_TEST_MODS, TEST_MOD_CLAMP, EDGE_SHAPES, EDGE_SHAPE_FALLBACK |
| [src/data/cards.js](../src/data/cards.js) | 140 | 5972 | RARITY_CN, directionOf, CARDS, CARD_BY_ID, BY_STAGE, RARITY_WEIGHT, STAGE_ORDER, stageRankOf, getCard, cardsOfStage, cardCount |
| [src/data/codex.js](../src/data/codex.js) | 42 | 2040 | CODEX_CATEGORIES, CODEX_BY_ID, CODEX_REWARDS, HINT_LEVELS |
| [src/data/codexCatalog.js](../src/data/codexCatalog.js) | 231 | 7971 | CODEX_CATALOG, CATALOG_BY_ID, itemsOf, totalOf, COUNTED_CATEGORIES, catalogTotal, foundCount, codexProgressView |
| [src/data/combos.js](../src/data/combos.js) | 44 | 1850 | COMBOS, COMBO_BY_ID, getCombo |
| [src/data/daily.js](../src/data/daily.js) | 28 | 1844 | MODIFIERS, MODIFIER_BY_ID, getModifier |
| [src/data/forgeBonuses.js](../src/data/forgeBonuses.js) | 109 | 5044 | BONUS_SLOTS, BONUS_TIMING, FORGE_BONUSES, BONUS_BY_ID, RESERVED, bonusById, availableBonuses |
| [src/data/forgeStatBalance.js](../src/data/forgeStatBalance.js) | 30 | 1568 | RARITY_BUDGET, SPECIALIST_CARD, normalizeForgeCardStats |
| [src/data/handlePalette.js](../src/data/handlePalette.js) | 67 | 4650 | HANDLE_PALETTE, handlePaletteOf |
| [src/data/index.js](../src/data/index.js) | 36 | 1195 | arena |
| [src/data/knifeTypes.js](../src/data/knifeTypes.js) | 61 | 2646 | KNIFE_TYPES, KNIFE_BY_ID, KNIFE_BY_MODEL, typeOf, modelOf, nameOfModel, resolveModelId, bladeNameOf |
| [src/data/legacy/arenaEvents.js](../src/data/legacy/arenaEvents.js) | 674 | 32593 | arenaEvents |
| [src/data/legacy/arenaMilestones.js](../src/data/legacy/arenaMilestones.js) | 58 | 2864 | arenaMilestones |
| [src/data/legacy/arenaOpponents.js](../src/data/legacy/arenaOpponents.js) | 155 | 6784 | arenaOpponents |
| [src/data/legacy/arenaStyles.js](../src/data/legacy/arenaStyles.js) | 278 | 14021 | arenaStyles |
| [src/data/legacy/arenaThemes.js](../src/data/legacy/arenaThemes.js) | 106 | 3444 | arenaThemes |
| [src/data/legacy/cardEffectRecipes.js](../src/data/legacy/cardEffectRecipes.js) | 58 | 2414 | cardEffectRecipes |
| [src/data/legacy/cardsV11.js](../src/data/legacy/cardsV11.js) | 7522 | 178680 | cardsV11 |
| [src/data/legacy/cardVisuals.js](../src/data/legacy/cardVisuals.js) | 179 | 12364 | cardVisuals |
| [src/data/legacy/cardWrites.js](../src/data/legacy/cardWrites.js) | 1813 | 30915 | cardWrites |
| [src/data/legacy/combosV11.js](../src/data/legacy/combosV11.js) | 447 | 10706 | combosV11 |
| [src/data/legacy/conditionEval.js](../src/data/legacy/conditionEval.js) | 345 | 13077 | conditionEval |
| [src/data/legacy/finishOverrides.js](../src/data/legacy/finishOverrides.js) | 103 | 6053 | finishOverrides |
| [src/data/legacy/knifeTypes.js](../src/data/legacy/knifeTypes.js) | 98 | 5576 | knifeTypes |
| [src/data/legacy/materials.js](../src/data/legacy/materials.js) | 99 | 7942 | materials |
| [src/data/legacy/temperIridescence.js](../src/data/legacy/temperIridescence.js) | 118 | 5219 | temperIridescence |
| [src/data/legacy/traitsV11.js](../src/data/legacy/traitsV11.js) | 1565 | 29861 | traitsV11 |
| [src/data/stages.js](../src/data/stages.js) | 83 | 3143 | STAGES, STAGE_COUNT, PLAYABLE_STAGES, stageAt, stageById |
| [src/data/tags.js](../src/data/tags.js) | 65 | 3680 | BASE_TAGS, SPECIAL_TAGS, FLAVOR_TAGS, TAGS, TAG_BY_ID, isBaseTag, isSpecialTag, isFlavorTag, tagName |
| [src/data/traits.js](../src/data/traits.js) | 261 | 11931 | BASE_TAG_TRAITS, baseTagTraitId, SPECIAL_TAG_TRAITS, HAMMER_TRAITS, hammerTraitId, HAMMER_DIRECTION_VECTORS, hammerDirectionVector, HAMMER_TIER_TRAITS, hammerTierTraitId, legacyTraits, setLegacyTraits, getTrait, traitName, traitRarityFloor |
| [src/platform/audio.js](../src/platform/audio.js) | 197 | 8837 | unlock, setEnabled, setVolume, settings, CUT_SOUND_MATERIALS, cutSoundProfile, playCutImpact, play, list |
| [src/platform/bus.js](../src/platform/bus.js) | 64 | 1979 | on, off, emit, clear, EVENTS |
| [src/platform/env.js](../src/platform/env.js) | 63 | 2191 | env |
| [src/platform/haptics.js](../src/platform/haptics.js) | 37 | 924 | setEnabled, isEnabled, vibrate, HAPTIC, feedback |
| [src/platform/index.js](../src/platform/index.js) | 22 | 671 | — |
| [src/platform/motion.js](../src/platform/motion.js) | 87 | 3011 | systemReduced, reduced, hasOverride, mode, setMode, syncFromSettings, subscribe, watchSystem |
| [src/platform/net.js](../src/platform/net.js) | 23 | 818 | isOnline, get, post, upload |
| [src/platform/rng.js](../src/platform/rng.js) | 96 | 2978 | hashSeed, makeRng, stream, randInt, pickOne, pickWeighted, shuffle, readableSeed |
| [src/platform/storage.js](../src/platform/storage.js) | 255 | 10669 | SAVE_VERSION, driver, startWriterSession, registerMigration, setDefaultsFactory, defaults, load, migrate, save, backupCurrent, reset, exportJson, setImportBoundary, importJson, readNationalCheckpoint, writeNationalCheckpoint, clearNationalCheckpoint |
| [src/render/bladeShape.js](../src/render/bladeShape.js) | 114 | 5110 | clearBladeShape, applyBladeShape |
| [src/render/captureRunner.js](../src/render/captureRunner.js) | 251 | 10510 | captureToDataURL, invalidateCaptureTargets, captureStats |
| [src/render/collectionCache.js](../src/render/collectionCache.js) | 88 | 3030 | loadThumbnail, saveThumbnail, thumbnailCacheStats |
| [src/render/collectionPreview.js](../src/render/collectionPreview.js) | 255 | 10174 | COLLECTION_EXPOSURE, applyCollectionPose, applyCollectionLighting, collectionStageStats, mountCollectionPreview, disconnectCollectionPreview, disconnectCollectionPreviews, releaseCollectionPreviewStage |
| [src/render/composeCache.js](../src/render/composeCache.js) | 78 | 3399 | composeInputKey, hashText, ComposePackCache |
| [src/render/gpuPreparation.js](../src/render/gpuPreparation.js) | 283 | 13298 | candidateWarmNeedsVisualRestore, materialCompileFingerprint, compileTransmissionPreparation, compileTransmissionVariants, preloadModels, preloadModelsInBackground, awaitIfCurrent, collectPreparationTargets, TextureUploadTracker, chooseModelPreload, chooseStartupPreload |
| [src/render/index.js](../src/render/index.js) | 1820 | 96485 | ensureS3TextureData, BladeStage, getStage, setRenderBackend, getRenderBackend, recipeNeedsMaterialTime, listModels |
| [src/render/legacy/_registry.js](../src/render/legacy/_registry.js) | 38 | 1456 | K3D_REGISTRY |
| [src/render/legacy/bladeEffects.js](../src/render/legacy/bladeEffects.js) | 281 | 11522 | bladeEffects |
| [src/render/legacy/bladeViewer.js](../src/render/legacy/bladeViewer.js) | 1582 | 89410 | bladeViewer |
| [src/render/legacy/cardEffects.js](../src/render/legacy/cardEffects.js) | 84 | 3384 | cardEffects |
| [src/render/legacy/material.js](../src/render/legacy/material.js) | 776 | 43844 | material |
| [src/render/legacy/regions.js](../src/render/legacy/regions.js) | 167 | 8777 | regions |
| [src/render/legacy/skin/bakedMotif.js](../src/render/legacy/skin/bakedMotif.js) | 428 | 20187 | FAMILY_GEN, ANIM_OMEGA, ANIMATED_FAMILIES, ANIM_FRAMES, isAnimated, canBake, getBakedAtlas, releaseBakedAtlas, bakedMotifCacheSize, bakedTileCacheSize, BAKED_TILE, BAKED_GRID, getAnimAtlas, releaseAnimAtlas, animCacheSize |
| [src/render/legacy/skin/finishes.js](../src/render/legacy/skin/finishes.js) | 121 | 6616 | finishes12 |
| [src/render/legacy/skin/grain.js](../src/render/legacy/skin/grain.js) | 58 | 2379 | grain |
| [src/render/legacy/skin/handleMaterials.js](../src/render/legacy/skin/handleMaterials.js) | 161 | 12142 | handleMaterials |
| [src/render/legacy/skin/materials.js](../src/render/legacy/skin/materials.js) | 257 | 17263 | materials24 |
| [src/render/legacy/skin/rarityVisuals.js](../src/render/legacy/skin/rarityVisuals.js) | 25 | 1243 | rarityVisuals |
| [src/render/legacy/skin/s3TexMaps.js](../src/render/legacy/skin/s3TexMaps.js) | 445 | 20040 | s3TexMaps |
| [src/render/legacy/skin/s3TexMapsData.js](../src/render/legacy/skin/s3TexMapsData.js) | 38 | 1578164 | s3TexMapsData |
| [src/render/legacy/skin/shader/bladeSkinShader.js](../src/render/legacy/skin/shader/bladeSkinShader.js) | 817 | 51137 | bladeSkinShader |
| [src/render/legacy/skin/shader/cardEffects.js](../src/render/legacy/skin/shader/cardEffects.js) | 435 | 31440 | shaderCardEffects |
| [src/render/legacy/skin/shader/finishes.js](../src/render/legacy/skin/shader/finishes.js) | 704 | 51973 | shaderFinishes |
| [src/render/legacy/skin/shader/handleLook.js](../src/render/legacy/skin/shader/handleLook.js) | 290 | 14650 | handleLookGLSL |
| [src/render/legacy/skin/shader/noise.js](../src/render/legacy/skin/shader/noise.js) | 168 | 7153 | shaderNoise |
| [src/render/legacy/skin/shader/patterns.js](../src/render/legacy/skin/shader/patterns.js) | 2204 | 44258 | shaderPatterns |
| [src/render/legacy/skin/shader/specialize.js](../src/render/legacy/skin/shader/specialize.js) | 413 | 19545 | selectChain, selectPattern, stubMotifBody, clearSpecializeCache, shaderSpecialize |
| [src/render/legacy/skin/state.js](../src/render/legacy/skin/state.js) | 813 | 55411 | bladeSkin |
| [src/render/legacy/skin/textures.js](../src/render/legacy/skin/textures.js) | 269 | 16035 | textures12 |
| [src/render/legacy/three.addons.js](../src/render/legacy/three.addons.js) | 7990 | 186268 | — |
| [src/render/legacy/three.bundle.js](../src/render/legacy/three.bundle.js) | 12 | 686413 | — |
| [src/render/legacy/viewer.js](../src/render/legacy/viewer.js) | 1478 | 81921 | — |
| [src/render/renderVisibility.js](../src/render/renderVisibility.js) | 17 | 850 | renderLoopAllowed, renderSurfaceVisible |
| [src/render/resourceLedger.js](../src/render/resourceLedger.js) | 255 | 9794 | GPU_BUDGET_MIB, estimateTextureMiB, estimateGeometryMiB, gpuLedger |
| [src/render/v2/finishRecipe.js](../src/render/v2/finishRecipe.js) | 774 | 44987 | CASE_HARDENED_PALETTE, TEMPER_PALETTE, FADE_PALETTE, DOPPLER_PALETTE, finishOperators, finishOperatorTable, S5_EFFECTS, S5_CARD_FAMILY, S5_CARD_ART, s5CardArt, S5_VISUAL_FAMILY, resolveS5Effect, refineS5BaseFinish, applyS5Effect, adaptS5PaletteToSubstrate, baseGradientPalette |
| [src/render/v2/glslSlices.js](../src/render/v2/glslSlices.js) | 167 | 7436 | blankComments, findFunctionSpan, extractFunction, extractFunctions, replaceFunctionBody, specializeStageChain |
| [src/render/v2/handleAtlasAsset.js](../src/render/v2/handleAtlasAsset.js) | 116 | 4976 | prefetchHandleAtlas, getHandleAtlasTexture, handleAtlasAssetStats, invalidateHandleAtlasAsset |
| [src/render/v2/handleLookBake.js](../src/render/v2/handleLookBake.js) | 259 | 11893 | HANDLE_KIND_COUNT, tileTransform, acquireHandleLook, handleAtlasStats, getHandleAtlasTarget, resetHandleAtlasForBake, invalidateHandleAtlas |
| [src/render/v2/normalAtlas.js](../src/render/v2/normalAtlas.js) | 336 | 13310 | SURFACE_KINDS, STAGE_SURFACE_KIND, getSurfaceAtlas, tileRectOf, surfaceAtlasInfo, releaseSurfaceAtlas |
| [src/render/v2/programFamilies.js](../src/render/v2/programFamilies.js) | 1446 | 86918 | FAMILY_VERSION, STAGE_FX, v2SourceStats, clearV2SourceCache, buildHook, familyKey, apply, refresh, detach, owns |
| [src/render/v2/s5OpticalArt.js](../src/render/v2/s5OpticalArt.js) | 157 | 8960 | s5Pattern, bakeS5Optical, S5_OPTICAL_PALETTES, getS5OpticalTexture |
| [src/render/v2/studioEnv.js](../src/render/v2/studioEnv.js) | 337 | 15662 | getStudioEnv, applyStudioEnvToScene, studioEnvInfo, releaseStudioEnv |
| [src/render/v2/surfaceDetail.js](../src/render/v2/surfaceDetail.js) | 429 | 23606 | buildNormalFragment, SURFACE_DEFAULTS, surfaceParamsOf |
| [src/ui/arenaDoodle.js](../src/ui/arenaDoodle.js) | 70 | 3118 | MARK_INKS, MARK_TYPES, handmarkMetrics, drawTargetHandmark |
| [src/ui/arenaImpact.js](../src/ui/arenaImpact.js) | 67 | 3431 | IMPACT_PRESETS, cutImpact, impactMotion, targetPose |
| [src/ui/arenaReportParts.js](../src/ui/arenaReportParts.js) | 117 | 4353 | momentumChip, momentumLadder, momentumHint, momentumTrail, FACE_CN, STAT_CN, FACE_STATS, faceOfStat, faceCompareRow |
| [src/ui/arenaSprites.js](../src/ui/arenaSprites.js) | 197 | 9004 | TYPES, STATES, CELL, spriteStatus, prepareArenaSprites, spriteReady, drawWholeSprite, drawSplitSprite, drawShardSprite, drawFlashSprite |
| [src/ui/arenaStage.js](../src/ui/arenaStage.js) | 1331 | 67295 | drawArenaStage |
| [src/ui/arenaStructureVisual.js](../src/ui/arenaStructureVisual.js) | 47 | 2290 | LINK_STYLES, linkStyle, joinedKey, breakPosition, createBreakTracker |
| [src/ui/bladeCard.js](../src/ui/bladeCard.js) | 383 | 16975 | bladeCardModel, bladeCard, bladeCardDetail, compareModels |
| [src/ui/bladeCardExport.js](../src/ui/bladeCardExport.js) | 196 | 10467 | collectibleFilename, posterInfo, renderCollectiblePoster, downloadCollectiblePoster |
| [src/ui/bladeEdgeProjection.js](../src/ui/bladeEdgeProjection.js) | 79 | 3844 | bladeEdgeProjection, bladeContourProjection |
| [src/ui/cardDoodles.js](../src/ui/cardDoodles.js) | 353 | 19290 | doodleSpec, cardDoodle |
| [src/ui/components.js](../src/ui/components.js) | 524 | 26300 | ICONS, riskBar, riskChip, statRail, statGrid, rarityBadge, qualitySeal, decisionCard, traitItem |
| [src/ui/dom.js](../src/ui/dom.js) | 152 | 6730 | el, clear, mount, on, countUp, toast, sheet |
| [src/ui/edgeHoningArtwork.js](../src/ui/edgeHoningArtwork.js) | 155 | 6164 | renderHoningArtwork |
| [src/ui/forgeKnifeStickers.js](../src/ui/forgeKnifeStickers.js) | 177 | 7125 | knifeFormOf, isKnifeGlow, KNIFE_FORM_COUNT, paintS4Knife |
| [src/ui/formalPerformance.js](../src/ui/formalPerformance.js) | 285 | 23126 | disposeFormalStage, pauseFormalStage, renderFormalSuite, completeFormalCut, abandonFormalSuite, drawFormalCutGuides, noteCutStroke, renderSuiteDiagnostics |
| [src/ui/formalTestStage.js](../src/ui/formalTestStage.js) | 571 | 24166 | disposeFormalTestStage, renderFormalTest |
| [src/ui/icons.js](../src/ui/icons.js) | 25 | 1257 | icon |
| [src/ui/minigameV4.js](../src/ui/minigameV4.js) | 302 | 14705 | renderHammerV4, renderEdgeV4 |
| [src/ui/pages/appraise.js](../src/ui/pages/appraise.js) | 731 | 34670 | create, render, enter, leave |
| [src/ui/pages/arena.js](../src/ui/pages/arena.js) | 2793 | 184288 | create, leave, openDailyChallenge, openQuickChallenge, openCollectionSample, openTournament, render |
| [src/ui/pages/daily.js](../src/ui/pages/daily.js) | 34 | 1200 | create, render |
| [src/ui/pages/forge.js](../src/ui/pages/forge.js) | 578 | 29226 | create, render, syncInspect, leave |
| [src/ui/pages/home.js](../src/ui/pages/home.js) | 118 | 4898 | create, render, syncInspect |
| [src/ui/pages/workshop.js](../src/ui/pages/workshop.js) | 728 | 38901 | create, leave, render, openTab |
| [src/ui/router.js](../src/ui/router.js) | 81 | 2846 | PAGES, register, onNavigate, go, currentKey, start |
| [src/ui/settingsSheet.js](../src/ui/settingsSheet.js) | 137 | 5684 | open |
| [src/ui/shell.js](../src/ui/shell.js) | 72 | 2244 | create, sync |
| [src/ui/stageControls.js](../src/ui/stageControls.js) | 58 | 2261 | createStageInspect |
| [src/ui/tutorial.js](../src/ui/tutorial.js) | 91 | 3742 | GUIDE, guideSheet, helpSheet, maybeShowFirstRun, hint, hasSeenHint |
