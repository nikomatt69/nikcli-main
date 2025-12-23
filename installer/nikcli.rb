class Nikcli < Formula
  desc "NikCLI - Context-Aware AI Development Assistant"
  homepage "https://github.com/nikomatt69/nikcli-main"
  version "1.6.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/nikomatt69/nikcli-main/releases/download/v#{version}/nikcli-macos-arm64.tar.gz"
      sha256 "9110fede0113efab8d30761594f583fd91db149faf5275a49bd7a93b35493acb"
    else
      url "https://github.com/nikomatt69/nikcli-main/releases/download/v#{version}/nikcli-macos-x64.tar.gz"
      sha256 "9110fede0113efab8d30761594f583fd91db149faf5275a49bd7a93b35493acb"
    end
  end

  on_linux do
    if Hardware::CPU.intel?
      url "https://github.com/nikomatt69/nikcli-main/releases/download/v#{version}/nikcli-linux-x64.tar.gz"
      sha256 "9110fede0113efab8d30761594f583fd91db149faf5275a49bd7a93b35493acb"
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
