package session

import (
	"testing"
)

func TestMouseModeUpdate(t *testing.T) {
	m := &MouseMode{}

	// Test enabling modes
	m.Update([]byte("\x1b[?1000h"))
	if !m.Mode1000 {
		t.Error("Mode1000 should be enabled")
	}

	m.Update([]byte("\x1b[?1002h"))
	if !m.Mode1002 {
		t.Error("Mode1002 should be enabled")
	}

	m.Update([]byte("\x1b[?1003h"))
	if !m.Mode1003 {
		t.Error("Mode1003 should be enabled")
	}

	m.Update([]byte("\x1b[?1006h"))
	if !m.Mode1006 {
		t.Error("Mode1006 should be enabled")
	}

	// Test GetEnableSequence
	seq := m.GetEnableSequence()
	expected := "\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h"
	if seq != expected {
		t.Errorf("Expected %q, got %q", expected, seq)
	}

	// Test disabling modes
	m.Update([]byte("\x1b[?1003l"))
	if m.Mode1003 {
		t.Error("Mode1003 should be disabled")
	}

	seq = m.GetEnableSequence()
	expected = "\x1b[?1000h\x1b[?1002h\x1b[?1006h"
	if seq != expected {
		t.Errorf("Expected %q, got %q", expected, seq)
	}

	// Test IsEnabled
	if !m.IsEnabled() {
		t.Error("IsEnabled should return true")
	}

	// Test Reset
	m.Reset()
	if m.IsEnabled() {
		t.Error("IsEnabled should return false after Reset")
	}
	if m.GetEnableSequence() != "" {
		t.Error("GetEnableSequence should return empty string after Reset")
	}
}

func TestMouseModeMultipleSequencesInOneUpdate(t *testing.T) {
	m := &MouseMode{}

	// Test multiple sequences in one chunk (like zellij sends)
	m.Update([]byte("\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h"))
	
	if !m.Mode1000 || !m.Mode1002 || !m.Mode1003 || !m.Mode1006 {
		t.Error("All modes should be enabled")
	}
}

func TestMouseModeSequenceInMixedData(t *testing.T) {
	m := &MouseMode{}

	// Test sequence mixed with other terminal output
	m.Update([]byte("some text\x1b[?1000hmore text\x1b[?1006h\n"))
	
	if !m.Mode1000 {
		t.Error("Mode1000 should be enabled")
	}
	if !m.Mode1006 {
		t.Error("Mode1006 should be enabled")
	}
	if m.Mode1002 || m.Mode1003 {
		t.Error("Mode1002 and Mode1003 should not be enabled")
	}
}

func TestAlternateScreenMode(t *testing.T) {
	m := &MouseMode{}

	// Test alternate screen detection
	m.Update([]byte("\x1b[?1049h"))
	if !m.AlternateScreen {
		t.Error("AlternateScreen should be true")
	}

	// When in alternate screen but no mouse mode, should return full mouse support
	seq := m.GetEnableSequence()
	expected := "\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h"
	if seq != expected {
		t.Errorf("Expected %q, got %q", expected, seq)
	}

	// Exit alternate screen
	m.Update([]byte("\x1b[?1049l"))
	if m.AlternateScreen {
		t.Error("AlternateScreen should be false")
	}

	// No mouse mode and not in alternate screen
	seq = m.GetEnableSequence()
	if seq != "" {
		t.Errorf("Expected empty string, got %q", seq)
	}
}

func TestAlternateScreenWithExplicitMouseMode(t *testing.T) {
	m := &MouseMode{}

	// Enter alternate screen and set explicit mouse mode
	m.Update([]byte("\x1b[?1049h\x1b[?1000h"))
	
	// Should use explicit mode, not full mouse support
	seq := m.GetEnableSequence()
	expected := "\x1b[?1000h"
	if seq != expected {
		t.Errorf("Expected %q, got %q", expected, seq)
	}
}

func TestGetModeRestoreSequence(t *testing.T) {
	m := &MouseMode{}

	// Test with no modes set
	seq := m.GetModeRestoreSequence()
	if seq != "" {
		t.Errorf("Expected empty string, got %q", seq)
	}

	// Test with alternate screen only (should include alt screen + full mouse)
	m.Update([]byte("\x1b[?1049h"))
	seq = m.GetModeRestoreSequence()
	expected := "\x1b[?1049h\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h"
	if seq != expected {
		t.Errorf("Expected %q, got %q", expected, seq)
	}

	// Test with alternate screen and explicit mouse mode
	m.Reset()
	m.Update([]byte("\x1b[?1049h\x1b[?1000h\x1b[?1006h"))
	seq = m.GetModeRestoreSequence()
	expected = "\x1b[?1049h\x1b[?1000h\x1b[?1006h"
	if seq != expected {
		t.Errorf("Expected %q, got %q", expected, seq)
	}

	// Test with mouse mode only (no alternate screen)
	m.Reset()
	m.Update([]byte("\x1b[?1000h\x1b[?1006h"))
	seq = m.GetModeRestoreSequence()
	expected = "\x1b[?1000h\x1b[?1006h"
	if seq != expected {
		t.Errorf("Expected %q, got %q", expected, seq)
	}
}
