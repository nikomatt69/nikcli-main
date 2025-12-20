class Nikcli < Formula
  desc "NikCLI - Context-Aware AI Development Assistant"
  homepage "https://github.com/nikomatt69/nikcli-main"
  version "1.6.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/nikomatt69/nikcli-main/releases/download/v#{version}/nikcli-macos-arm64.tar.gz"
      sha256 "d0a69454bb2f42b388704f3cd4cfd4b881a5bd1e7615292970ce07195a3b7065"
    else
      url "https://github.com/nikomatt69/nikcli-main/releases/download/v#{version}/nikcli-macos-x64.tar.gz"
      sha256 "d0a69454bb2f42b388704f3cd4cfd4b881a5bd1e7615292970ce07195a3b7065"
    end
  end

  on_linux do
    if Hardware::CPU.intel?
      url "https://github.com/nikomatt69/nikcli-main/releases/download/v#{version}/nikcli-linux-x64.tar.gz"
      sha256 "d0a69454bb2f42b388704f3cd4cfd4b881a5bd1e7615292970ce07195a3b7065"
    end
  end

  def install
    # Install the entire package structure
    libexec.install Dir["*"]

    # Create symlink for the wrapper script
    bin.install_symlink libexec/"bin/nikcli"
  end

  test do
    system "#{bin}/nikcli", "--version"
  end
end
