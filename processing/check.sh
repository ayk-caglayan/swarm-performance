#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
app=/Applications/Processing.app/Contents/app
java="$app/resources/jdk/bin/java"
javac="$app/resources/jdk/bin/javac"
work=$(mktemp -d "${TMPDIR:-/tmp}/swarm-plant-check.XXXXXX")
trap 'rm -rf "$work"' EXIT HUP INT TERM
for sketch in BranchingGarden BloomColony; do
  "$java" -Dcompose.application.resources.dir="$app/resources" -cp "$app/*" processing.mode.java.Commander --sketch="$root/$sketch" --output="$work/$sketch" --build
done
cmp "$root/BranchingGarden/Performance.pde" "$root/BloomColony/Performance.pde"
cmp "$root/BranchingGarden/PlantProtocol.java" "$root/BloomColony/PlantProtocol.java"
classpath="$app/*:$work/BranchingGarden:$work/BloomColony:$root/BranchingGarden/code/oscP5.jar"
mkdir "$work/tests"
"$javac" -cp "$classpath" -d "$work/tests" "$root/tests/PlantProtocolTest.java" "$root/tests/PlantControlTest.java"
"$java" -cp "$classpath:$work/tests" PlantProtocolTest
"$java" -cp "$classpath:$work/tests" PlantControlTest
