package com.stickify.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class FfmpegLadderTest {

    @Test
    void shortClipsStartAtTopQuality() {
        assertThat(FfmpegConverter.firstStep(3)).isZero();
        assertThat(FfmpegConverter.firstStep(4)).isZero();
    }

    @Test
    void longClipsStartLower() {
        assertThat(FfmpegConverter.firstStep(4.5)).isEqualTo(2);
        assertThat(FfmpegConverter.firstStep(10)).isEqualTo(2);
    }

    @Test
    void skipsFurtherWhenFarOverTheLimit() {
        assertThat(FfmpegConverter.stepsToSkip(510_000, 500_000)).isEqualTo(1);
        assertThat(FfmpegConverter.stepsToSkip(900_000, 500_000)).isEqualTo(2);
        assertThat(FfmpegConverter.stepsToSkip(1_500_000, 500_000)).isEqualTo(3);
        assertThat(FfmpegConverter.stepsToSkip(-1, 500_000)).isEqualTo(1);
    }

    @Test
    void ladderStartsAtFifteenFramesPerSecond() {
        assertThat(FfmpegConverter.ANIMATED_STEPS[0][0]).isEqualTo(15);
        assertThat(FfmpegConverter.firstStep(10)).isLessThan(FfmpegConverter.ANIMATED_STEPS.length);
    }
}
